import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function AdminRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-8 text-center text-gray-400 font-mono">Loading...</div>;
  }

  if (!user || !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
