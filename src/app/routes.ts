import { createBrowserRouter } from 'react-router';
import type { ComponentType } from 'react';
import Layout from './components/Layout';
import { isModuleContentEnabled } from './config/deliveryScope';

const page = (loader: () => Promise<{ default: ComponentType }>) =>
  async () => ({ Component: (await loader()).default });

const optionalPage = (
  moduleCode: Parameters<typeof isModuleContentEnabled>[0],
  loader: () => Promise<{ default: ComponentType }>
) =>
  isModuleContentEnabled(moduleCode)
    ? page(loader)
    : page(() => import('./pages/DeliveryPlaceholder'));

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: page(() => import('./pages/Login')),
  },
  {
    path: '/reset-password',
    lazy: page(() => import('./pages/ResetPassword')),
  },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, lazy: page(() => import('./pages/Dashboard')) },
      { path: 'patients', lazy: page(() => import('./pages/Patients')) },
      { path: 'maintenance', lazy: page(() => import('./pages/PatientCatalogs')) },
      { path: 'patients/:id', lazy: page(() => import('./pages/PatientDetail')) },
      {
        path: 'appointments',
        lazy: optionalPage('appointments', () => import('./pages/Appointments')),
      },
      {
        path: 'grooming',
        lazy: optionalPage('grooming', () => import('./pages/Grooming')),
      },
      {
        path: 'inventory',
        lazy: optionalPage('inventory', () => import('./pages/Inventory')),
      },
      {
        path: 'prescriptions',
        lazy: optionalPage('prescriptions', () => import('./pages/Prescriptions')),
      },
      {
        path: 'ai-reports',
        lazy: optionalPage('aiReports', () => import('./pages/AIReports')),
      },
      { path: 'users', lazy: page(() => import('./pages/Users')) },
    ],
  },
]);
