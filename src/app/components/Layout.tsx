import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { isAuthenticated, isSessionReady } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (isSessionReady && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isSessionReady, navigate]);

  if (!isSessionReady || !isAuthenticated) {
    return null;
  }

  return (
    <div
      className="relative min-h-screen min-h-dvh overflow-x-hidden"
      style={{
        background: 'var(--app-background)',
      }}
    >
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/45 backdrop-blur-sm lg:hidden"
        />
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        onNavigate={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
      />

      <div
        className={`min-h-screen min-h-dvh min-w-0 flex flex-col transition-[padding] duration-200 ${
          isSidebarCollapsed ? 'lg:pl-[4.25rem]' : 'lg:pl-[13.6rem]'
        }`}
      >
        <Header onMenuClick={() => setIsSidebarOpen(true)} />

        <main className="app-main flex-1 min-w-0 w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
