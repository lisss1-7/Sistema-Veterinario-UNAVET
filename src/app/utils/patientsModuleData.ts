export type PatientsModuleData = {
  patients: any[];
  species: any[];
  sexes: any[];
  reproductiveStatuses: any[];
};

const API_URL = '/api';
let patientsRequest: Promise<any[]> | null = null;
let patientCatalogsRequest: Promise<
  Pick<PatientsModuleData, 'species' | 'sexes' | 'reproductiveStatuses'>
> | null = null;

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

const fetchCollection = async (endpoint: string) => {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Error al cargar ${endpoint}`);
  }

  return Array.isArray(data) ? data : [];
};

export const getPatientsList = () => {
  if (!patientsRequest) {
    patientsRequest = fetchCollection('pacientes').finally(() => {
      patientsRequest = null;
    });
  }

  return patientsRequest;
};

export const getPatientCatalogs = () => {
  if (!patientCatalogsRequest) {
    patientCatalogsRequest = Promise.all([
      fetchCollection('catalogos/especies'),
      fetchCollection('catalogos/sexos'),
      fetchCollection('catalogos/estados-reproductivos'),
    ])
      .then(([species, sexes, reproductiveStatuses]) => ({
        species,
        sexes,
        reproductiveStatuses,
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
