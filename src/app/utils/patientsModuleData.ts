import type { Patient } from './types';
import { getAuthHeaders, requestJson } from './apiClient';

export type PatientCatalogOption = {
  nombre: string;
  especie_id?: number;
  raza_id?: number;
  opcion_alimentacion_id?: number;
};

export type PatientsModuleData = {
  patients: Patient[];
  species: PatientCatalogOption[];
  sexes: PatientCatalogOption[];
  reproductiveStatuses: PatientCatalogOption[];
  dietOptions: PatientCatalogOption[];
};

let patientsRequest: Promise<Patient[]> | null = null;
let patientCatalogsRequest: Promise<
  Pick<PatientsModuleData, 'species' | 'sexes' | 'reproductiveStatuses' | 'dietOptions'>
> | null = null;

type Prefetch<T> = { promise: Promise<T>; expiresAt: number };
let preloadedPatients: Prefetch<Patient[]> | null = null;
let preloadedCatalogs: Prefetch<Pick<PatientsModuleData, 'species' | 'sexes' | 'reproductiveStatuses' | 'dietOptions'>> | null = null;
let requestSession = '';
if (typeof window !== 'undefined') {
  window.addEventListener('unavet-read-cache-cleared', () => {
    preloadedPatients = null;
    preloadedCatalogs = null;
    patientsRequest = null;
    patientCatalogsRequest = null;
  });
}
const PREFETCH_TTL_MS = 30000;
const checkSession = () => {
  const session = getAuthHeaders().Authorization;
  if (session !== requestSession) {
    requestSession = session;
    patientsRequest = null;
    patientCatalogsRequest = null;
    preloadedPatients = null;
    preloadedCatalogs = null;
  }
};

const fetchCollection = async <T>(endpoint: string): Promise<T[]> => {
  const data = await requestJson<unknown>(endpoint, {
    defaultError: `Error al cargar ${endpoint}`,
  });
  return Array.isArray(data) ? data as T[] : [];
};

export const getPatientsList = (usePrefetch = false) => {
  checkSession();
  const prefetched = preloadedPatients;
  preloadedPatients = null;
  if (usePrefetch && prefetched && prefetched.expiresAt > Date.now()) return prefetched.promise;
  if (!patientsRequest) {
    const request = fetchCollection<Patient>('pacientes').finally(() => {
      if (patientsRequest === request) patientsRequest = null;
    });
    patientsRequest = request;
  }

  return patientsRequest;
};

export const getPatientCatalogs = (usePrefetch = false) => {
  checkSession();
  const prefetched = preloadedCatalogs;
  preloadedCatalogs = null;
  if (usePrefetch && prefetched && prefetched.expiresAt > Date.now()) return prefetched.promise;
  if (!patientCatalogsRequest) {
    const request = Promise.all([
      fetchCollection<PatientCatalogOption>('catalogos/especies'),
      fetchCollection<PatientCatalogOption>('catalogos/sexos'),
      fetchCollection<PatientCatalogOption>('catalogos/estados-reproductivos'),
      fetchCollection<PatientCatalogOption>('catalogos/opciones-alimentacion').catch((error) => {
        console.error('Error al cargar opciones de alimentación:', error);
        return [];
      }),
    ])
      .then(([species, sexes, reproductiveStatuses, dietOptions]) => ({
        species,
        sexes,
        reproductiveStatuses,
        dietOptions,
      }))
      .finally(() => {
        if (patientCatalogsRequest === request) patientCatalogsRequest = null;
      });
    patientCatalogsRequest = request;
  }

  return patientCatalogsRequest;
};

export const preloadPatientsModule = () => {
  checkSession();
  if (!preloadedPatients || preloadedPatients.expiresAt <= Date.now()) {
    const promise = getPatientsList();
    const entry = { promise, expiresAt: Date.now() + PREFETCH_TTL_MS };
    preloadedPatients = entry;
    void promise.catch(() => { if (preloadedPatients === entry) preloadedPatients = null; });
  }
  if (!preloadedCatalogs || preloadedCatalogs.expiresAt <= Date.now()) {
    const promise = getPatientCatalogs();
    const entry = { promise, expiresAt: Date.now() + PREFETCH_TTL_MS };
    preloadedCatalogs = entry;
    void promise.catch(() => { if (preloadedCatalogs === entry) preloadedCatalogs = null; });
  }
};
