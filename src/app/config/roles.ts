export type UserRole = string;

export const isAdministratorRole = (role?: UserRole | null) =>
  role?.trim().toLocaleLowerCase('es') === 'administrador';
