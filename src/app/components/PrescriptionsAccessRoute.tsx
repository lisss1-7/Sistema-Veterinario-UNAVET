import { Navigate, Outlet } from 'react-router';
import { useModulePermissions } from '../hooks/useModulePermissions';

export default function PrescriptionsAccessRoute() {
  const { permissions, isLoadingPermissions } = useModulePermissions('prescriptions');

  if (isLoadingPermissions) return null;

  return permissions.canView ? <Outlet /> : <Navigate to="/" replace />;
}
