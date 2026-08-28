export type DeliveryMode = 'first-delivery' | 'full';

export type ProposedModuleCode =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'grooming'
  | 'inventory'
  | 'prescriptions'
  | 'aiReports'
  | 'users';

export type SystemModule = {
  codigo: ProposedModuleCode | string;
  nombre: string;
  ruta: string;
  orden?: number;
};

const configuredMode = String(
  import.meta.env.VITE_DELIVERY_MODE || 'first-delivery'
)
  .trim()
  .toLowerCase();

export const DELIVERY_MODE: DeliveryMode =
  configuredMode === 'full' ? 'full' : 'first-delivery';

export const IS_FIRST_DELIVERY_MODE = DELIVERY_MODE === 'first-delivery';

// Estos identificadores pertenecen al control de alcance y a las rutas.
// Los nombres, rutas y orden visibles se obtienen de modulos_sistema en la BD.
const FIRST_DELIVERY_CONTENT = new Set<ProposedModuleCode>([
  'dashboard',
  'patients',
  'users',
]);

export const isModuleContentEnabled = (code: ProposedModuleCode | string) => {
  if (!IS_FIRST_DELIVERY_MODE) return true;

  return FIRST_DELIVERY_CONTENT.has(code as ProposedModuleCode);
};
