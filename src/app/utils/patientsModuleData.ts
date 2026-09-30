import type { Patient } from './types';
import { requestJson } from './apiClient';

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

const fetchCollection = async <T>(endpoint: string): Promise<T[]> => {
  const data = await requestJson<unknown>(endpoint, {
    defaultError: `Error al cargar ${endpoint}`,
  });
  return Array.isArray(data) ? data as T[] : [];
};

export const getPatientsList = () => {
  if (!patientsRequest) {
    patientsRequest = fetchCollection<Patient>('pacientes').finally(() => {
      patientsRequest = null;
    });
  }

  return patientsRequest;
};

export const getPatientCatalogs = () => {
  if (!patientCatalogsRequest) {
    patientCatalogsRequest = Promise.all([
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
        patientCatalogsRequest = null;
      });
  }

  return patientCatalogsRequest;
};

export const preloadPatientsModule = () => {
  void getPatientsList().catch(() => undefined);
  void getPatientCatalogs().catch(() => undefined);
};
