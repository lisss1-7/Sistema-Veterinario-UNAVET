import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { isAdministratorRole } from '../config/roles';

export default function AdministratorRoute() {
  const { user, isSessionReady } = useAuth();

  if (!isSessionReady) return null;

  return isAdministratorRole(user?.role)
    ? <Outlet />
    : <Navigate to="/" replace />;
}
