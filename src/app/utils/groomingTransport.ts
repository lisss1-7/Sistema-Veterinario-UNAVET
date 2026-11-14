import type { GroomingAppointment } from './types';

// Las citas anteriores sin ruta conservan su cupo individual original.
export const countGroomingTransportRoutes = (appointments: GroomingAppointment[]) =>
  new Set(appointments.map(item => item.routeId ? `ruta-${item.routeId}` : `cita-${item.id}`)).size;

export const groomingRouteCost = (appointment: GroomingAppointment) =>
  appointment.routeId ? Number(appointment.routeTransportCost || 0) : Number(appointment.transportCost || 0);
