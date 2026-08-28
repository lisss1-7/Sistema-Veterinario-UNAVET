import { createBrowserRouter } from 'react-router';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients, { RegisterPatient } from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import PatientCatalogs from './pages/PatientCatalogs';
import Appointments from './pages/Appointments';
import Grooming from './pages/Grooming';
import Inventory from './pages/Inventory';
import Prescriptions from './pages/Prescriptions';
import AIReports from './pages/AIReports';
import Users from './pages/Users';
import DeliveryPlaceholder from './pages/DeliveryPlaceholder';
import { isModuleContentEnabled } from './config/deliveryScope';
// TEMPORAL: módulo "Mi perfil" desactivado hasta nueva indicación.
// import Profile from './pages/Profile';
import ResetPassword from './pages/ResetPassword';

const AppointmentsRoute = isModuleContentEnabled('appointments')
  ? Appointments
  : DeliveryPlaceholder;
const GroomingRoute = isModuleContentEnabled('grooming')
  ? Grooming
  : DeliveryPlaceholder;
const InventoryRoute = isModuleContentEnabled('inventory')
  ? Inventory
  : DeliveryPlaceholder;
const PrescriptionsRoute = isModuleContentEnabled('prescriptions')
  ? Prescriptions
  : DeliveryPlaceholder;
const AIReportsRoute = isModuleContentEnabled('aiReports')
  ? AIReports
  : DeliveryPlaceholder;

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/reset-password',
    Component: ResetPassword,
  },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'patients', Component: Patients },
      { path: 'patients/register', Component: RegisterPatient },
      { path: 'patients/catalogs', Component: PatientCatalogs },
      { path: 'patients/:id', Component: PatientDetail },
      { path: 'appointments', Component: AppointmentsRoute },
      { path: 'grooming', Component: GroomingRoute },
      { path: 'inventory', Component: InventoryRoute },
      { path: 'prescriptions', Component: PrescriptionsRoute },
      { path: 'ai-reports', Component: AIReportsRoute },
      { path: 'users', Component: Users },
      // TEMPORAL: módulo "Mi perfil" desactivado hasta nueva indicación.
      // { path: 'profile', Component: Profile },
    ],
  },
]);
