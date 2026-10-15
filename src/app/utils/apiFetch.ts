import { API_URL } from '../config/api';

type CachedResponse = { response: Response; expiresAt: number; once: boolean };
const pending = new Map<string, Promise<Response>>();
const cached = new Map<string, CachedResponse>();
const prefetchKeys = new Set<string>();
let session = '';
let generation = 0;

export const clearApiCache = () => {
  generation += 1;
  pending.clear();
  cached.clear();
  prefetchKeys.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('unavet-read-cache-cleared'));
};

const forSubscriber = (promise: Promise<Response>, signal?: AbortSignal | null): Promise<Response> => {
  if (!signal) return promise.then(response => response.clone());
  if (signal.aborted) return Promise.reject(new DOMException('Solicitud cancelada', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Solicitud cancelada', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(response => { if (!signal.aborted) resolve(response.clone()); }, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};

// Comparte lecturas; las escrituras siempre llegan al servidor e invalidan
// respuestas anteriores, incluso si había una lectura pendiente.
export const apiFetch = (
  input: RequestInfo | URL,
  init: RequestInit = {},
  prefetch = false,
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const origin = globalThis.location?.origin || 'http://localhost';
  const parsed = new URL(url, origin);
  const base = new URL(`${API_URL}/`, origin);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname)) return globalThis.fetch(input, init);
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const authorization = headers.get('authorization') || '';
  if (authorization !== session) { session = authorization; clearApiCache(); }
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') {
    clearApiCache();
    return globalThis.fetch(input, init).finally(clearApiCache);
  }
  const signal = init.signal || (input instanceof Request ? input.signal : undefined);
  if (signal?.aborted) return Promise.reject(new DOMException('Solicitud cancelada', 'AbortError'));
  const key = `${authorization}|${parsed.href}|${init.credentials || 'same-origin'}|${headers.get('accept') || ''}`;
  const now = Date.now();
  for (const [oldKey, entry] of cached) if (entry.expiresAt <= now) cached.delete(oldKey);
  const existing = cached.get(key);
  if (existing && init.cache !== 'no-store' && init.cache !== 'reload') {
    if (existing.once && !prefetch) cached.delete(key);
    return forSubscriber(Promise.resolve(existing.response), signal);
  }
  let request = pending.get(key);
  if (prefetch) prefetchKeys.add(key);
  if (!request) {
    const startedGeneration = generation;
    const endpoint = parsed.pathname.slice(base.pathname.length);
    const catalog = endpoint.startsWith('catalogos/') && !endpoint.includes('horarios') && !endpoint.startsWith('catalogos/proceso-pacientes/');
    request = globalThis.fetch(input, { ...init, signal: null }).then(response => {
      const wasPrefetched = prefetchKeys.has(key);
      const ttl = catalog ? (endpoint === 'catalogos/mis-modulos' ? 5000 : 30000) : wasPrefetched ? 15000 : 0;
      if (response.ok && ttl && startedGeneration === generation && init.cache !== 'no-store') {
        cached.set(key, { response, expiresAt: Date.now() + ttl, once: wasPrefetched && !catalog });
      }
      return response;
    }).finally(() => { if (pending.get(key) === request) { pending.delete(key); prefetchKeys.delete(key); } });
    pending.set(key, request);
  }
  return forSubscriber(request, signal);
};

export const preloadModuleData = (moduleCode: string) => {
  const endpoints: Record<string, string[]> = {
    dashboard: ['dashboard/resumen'],
    appointments: ['citas', 'pacientes'],
    grooming: ['grooming', 'pacientes'],
    inventory: ['inventario'],
    prescriptions: ['recetas', 'pacientes'],
    users: ['usuarios?includeDeleted=true'],
    'aiReports': ['catalogos/mis-modulos'],
    maintenance: ['catalogos/modulos-sistema'],
  };
  const token = localStorage.getItem('unavet_token') || localStorage.getItem('token');
  for (const endpoint of endpoints[moduleCode] || []) {
    void apiFetch(`${API_URL}/${endpoint}`, { headers: { Authorization: `Bearer ${token || ''}` } }, true).catch(() => undefined);
  }
};
