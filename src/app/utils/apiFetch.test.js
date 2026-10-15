import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, api;
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const headers = { Authorization: 'Bearer session-a' };
const json = value => Response.json(value);
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  api = await server.ssrLoadModule('/src/app/utils/apiFetch.ts');
  globalThis.localStorage = { getItem: () => 'session-a' };
});
test.beforeEach(() => api.clearApiCache());
test.after(async () => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  await server?.close();
});

test('comparte lecturas y permite cancelar una pantalla sin cancelar la otra', async () => {
  let finish, calls = 0;
  globalThis.fetch = async (url, options) => { calls++; assert.equal(options.signal, null); return new Promise(resolve => { finish = resolve; }); };
  const controller = new AbortController();
  const first = api.apiFetch('/api/pacientes', { headers, signal: controller.signal });
  const second = api.apiFetch('/api/pacientes', { headers });
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  finish(json([{ id: 1 }]));
  assert.deepEqual(await (await second).json(), [{ id: 1 }]);
  assert.equal(calls, 1);
});

test('reutiliza catálogos y una escritura obliga a volver a leer', async () => {
  let calls = 0;
  globalThis.fetch = async () => json({ version: ++calls });
  const first = await api.apiFetch('/api/catalogos/roles', { headers });
  const second = await api.apiFetch('/api/catalogos/roles', { headers });
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(calls, 1);
  await api.apiFetch('/api/usuarios/2', { headers, method: 'PUT' });
  assert.equal((await (await api.apiFetch('/api/catalogos/roles', { headers })).json()).version, 3);
});

test('precarga registros una vez; la siguiente lectura consulta de nuevo', async () => {
  let calls = 0;
  globalThis.fetch = async () => json({ version: ++calls });
  api.preloadModuleData('inventory');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await (await api.apiFetch('/api/inventario', { headers })).json()).version, 1);
  assert.equal((await (await api.apiFetch('/api/inventario', { headers })).json()).version, 2);
});

test('precargar aprovecha una lectura que las notificaciones ya habían iniciado', async () => {
  let finish, calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const notifications = api.apiFetch('/api/inventario', { headers });
  api.preloadModuleData('inventory');
  finish(json({ fresh: true }));
  await notifications;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await (await api.apiFetch('/api/inventario', { headers })).json()).fresh, true);
  assert.equal(calls, 1);
});

test('no comparte datos entre sesiones ni conserva errores o disponibilidad', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };
  await api.apiFetch('/api/catalogos/roles', { headers });
  await api.apiFetch('/api/catalogos/roles', { headers: { Authorization: 'Bearer session-b' } });
  assert.equal(calls, 2);
  await api.apiFetch('/api/catalogos/horarios?date=2026-10-12', { headers });
  await api.apiFetch('/api/catalogos/horarios?date=2026-10-12', { headers });
  assert.equal(calls, 4);
  globalThis.fetch = async () => { calls++; return Response.json({ message: 'Sin acceso' }, { status: 403 }); };
  await api.apiFetch('/api/catalogos/especies', { headers });
  await api.apiFetch('/api/catalogos/especies', { headers });
  assert.equal(calls, 6);
});

test('una lectura antigua no vuelve a llenar la caché después de guardar', async () => {
  let finish, calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : json({ fresh: true }); };
  const old = api.apiFetch('/api/catalogos/roles', { headers });
  await api.apiFetch('/api/usuarios/2', { headers, method: 'PUT' });
  finish(json({ fresh: false }));
  await old;
  assert.equal((await (await api.apiFetch('/api/catalogos/roles', { headers })).json()).fresh, true);
  assert.equal(calls, 3);
});

test('los permisos vencen y vuelven a validarse con el servidor', async () => {
  const originalNow = Date.now;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  globalThis.fetch = async () => json({ version: ++calls });
  try {
    await api.apiFetch('/api/catalogos/mis-modulos', { headers });
    await api.apiFetch('/api/catalogos/mis-modulos', { headers });
    assert.equal(calls, 1);
    now += 5001;
    await api.apiFetch('/api/catalogos/mis-modulos', { headers });
    assert.equal(calls, 2);
  } finally { Date.now = originalNow; }
});
