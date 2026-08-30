import {
  Bell,
  Bone,
  CalendarDays,
  Cat,
  Dog,
  LogOut,
  Menu,
  Package,
  PawPrint,
  RotateCcw,
  Scissors,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { ThemeToggle } from './ThemeToggle';

type NotificationType = 'stock' | 'appointment' | 'grooming';

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timeLabel?: string;
};

const STORAGE_KEYS = {
  DISMISSED_NOTIFICATIONS: 'unavet_dismissed_notifications',
};

const API_URL = '/api';

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') ||
    localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

type HeaderProps = {
  onMenuClick?: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const notificationCount = notifications.length;

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(() => {
      loadNotifications();
    }, 10000);

    const handleUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('unavet-data-updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('unavet-data-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (!showNotifications) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [showNotifications]);

  const getDismissedNotifications = (): string[] => {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEYS.DISMISSED_NOTIFICATIONS) || '[]'
    );
  };

  const saveDismissedNotifications = (ids: string[]) => {
    localStorage.setItem(
      STORAGE_KEYS.DISMISSED_NOTIFICATIONS,
      JSON.stringify(ids)
    );
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const isTodayOrTomorrow = (date?: string) => {
    if (!date) return false;

    const today = getTodayDate();
    const tomorrow = getTomorrowDate();

    return date === today || date === tomorrow;
  };

  const isPendingStatus = (status?: string) => {
    const normalizedStatus = status || 'Pendiente';

    return (
      normalizedStatus !== 'Completada' &&
      normalizedStatus !== 'Cancelada' &&
      normalizedStatus !== 'Completado' &&
      normalizedStatus !== 'Cancelado'
    );
  };

  const formatDateTimeLabel = (date?: string, time?: string) => {
    if (!date && !time) return '';

    if (date && time) {
      return `${date} a las ${time}`;
    }

    return date || time || '';
  };

  const fetchCollection = async (endpoint: string) => {
    try {
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error al cargar ${endpoint}`);
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`Error al cargar ${endpoint}:`, error);
      return [];
    }
  };

  const loadNotifications = async () => {
    const dismissed = getDismissedNotifications();

    const [inventory, appointments, grooming] = await Promise.all([
      fetchCollection('inventario'),
      fetchCollection('citas'),
      fetchCollection('grooming'),
    ]);

    const stockNotifications: NotificationItem[] = inventory
      .filter((product: any) => {
        return (
          Number(product.currentStock || 0) <= Number(product.minStock || 0) &&
          product.status !== 'Inactivo'
        );
      })
      .map((product: any) => ({
        id: `stock-${product.id}`,
        type: 'stock',
        title: 'Stock bajo',
        message: `${product.name} tiene ${product.currentStock} unidades disponibles. Stock mínimo: ${product.minStock}.`,
      }));

    const appointmentNotifications: NotificationItem[] = appointments
      .filter((appointment: any) => {
        return (
          isTodayOrTomorrow(appointment.date) &&
          isPendingStatus(appointment.status)
        );
      })
      .map((appointment: any) => ({
        id: `appointment-${appointment.id}`,
        type: 'appointment',
        title: 'Cita clínica próxima',
        message: `${appointment.petName || 'Paciente'} tiene cita clínica con su tutor ${
          appointment.tutorName || 'tutor no especificado'
        }.`,
        timeLabel: formatDateTimeLabel(appointment.date, appointment.time),
      }));

    const groomingNotifications: NotificationItem[] = grooming
      .filter((item: any) => {
        return (
          isTodayOrTomorrow(item.date) &&
          isPendingStatus(item.status)
        );
      })
      .map((item: any) => ({
        id: `grooming-${item.id}`,
        type: 'grooming',
        title: 'Grooming próximo',
        message: `${item.petName || 'Mascota'} tiene servicio de grooming.`,
        timeLabel: formatDateTimeLabel(item.date, item.time),
      }));

    const allNotifications = [
      ...stockNotifications,
      ...appointmentNotifications,
      ...groomingNotifications,
    ].filter((notification) => !dismissed.includes(notification.id));

    setNotifications(allNotifications);
  };

  const dismissNotification = (id: string) => {
    const dismissed = getDismissedNotifications();
    const updatedDismissed = Array.from(new Set([...dismissed, id]));

    saveDismissedNotifications(updatedDismissed);

    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id)
    );
  };

  const clearAllNotifications = () => {
    const dismissed = getDismissedNotifications();
    const currentIds = notifications.map((notification) => notification.id);

    const updatedDismissed = Array.from(new Set([...dismissed, ...currentIds]));

    saveDismissedNotifications(updatedDismissed);
    setNotifications([]);
  };

  const restoreNotifications = () => {
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_NOTIFICATIONS);
    void loadNotifications();
  };

  const getNotificationIcon = (type: NotificationType) => {
    if (type === 'stock') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C9962F]/30 bg-[#C9962F]/15 text-[#E3B95F]">
          <Package className="h-4 w-4" strokeWidth={2} />
        </div>
      );
    }

    if (type === 'appointment') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C9962F]/30 bg-[#C9962F]/15 text-[#E3B95F]">
          <CalendarDays className="h-4 w-4" strokeWidth={2} />
        </div>
      );
    }

    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C9962F]/30 bg-[#C9962F]/15 text-[#E3B95F]">
        <Scissors className="h-4 w-4" strokeWidth={2} />
      </div>
    );
  };

  const getNotificationStyle = (_type: NotificationType) =>
    'border-white/10 bg-white/5';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="relative z-50 isolate flex items-center justify-between gap-1.5 border-b border-white/10 px-2 py-3 min-[380px]:gap-2 min-[380px]:px-3 sm:px-4 md:gap-3 md:px-8 md:py-4"
      style={{
        background: 'var(--sidebar)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden text-sidebar-foreground"
        aria-hidden="true"
      >
        <Bone
          className="absolute left-[3%] -top-3 h-9 w-9 rotate-[42deg] text-[#C9962F] opacity-[0.18]"
          strokeWidth={1.5}
        />
        <PawPrint
          className="absolute left-[12%] -bottom-2 h-8 w-8 -rotate-[22deg] opacity-[0.17]"
          strokeWidth={1.5}
        />
        <PawPrint
          className="absolute left-[34%] top-1/2 h-10 w-10 -rotate-12 text-[#C9962F] opacity-[0.24]"
          strokeWidth={1.5}
        />
        <PawPrint
          className="absolute left-[58%] -bottom-2 h-7 w-7 rotate-[24deg] opacity-[0.19]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute right-[27%] -top-2 h-8 w-8 -rotate-[30deg] text-[#C9962F] opacity-[0.21]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-[47%] -top-2 h-8 w-8 rotate-[28deg] opacity-[0.2]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-[61%] bottom-0 h-9 w-9 -rotate-[35deg] text-[#C9962F] opacity-[0.2]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-[22%] -bottom-2 h-7 w-7 -rotate-[18deg] opacity-[0.17]"
          strokeWidth={1.3}
        />
        <PawPrint
          className="absolute left-[27%] -top-2 h-7 w-7 rotate-[36deg] opacity-[0.17]"
          strokeWidth={1.3}
        />
        <Bone
          className="absolute left-[72%] -top-2 h-6 w-6 rotate-[58deg] opacity-[0.16]"
          strokeWidth={1.3}
        />
        <PawPrint
          className="absolute left-[78%] -bottom-2 h-7 w-7 -rotate-[24deg] text-[#C9962F] opacity-[0.18]"
          strokeWidth={1.3}
        />
        <Cat
          className="absolute right-[16%] -bottom-4 h-16 w-16 -rotate-6 opacity-[0.17]"
          strokeWidth={1.3}
        />
        <Dog
          className="absolute right-[3%] -top-2 h-14 w-14 rotate-6 text-[#C9962F] opacity-[0.19]"
          strokeWidth={1.3}
        />
        <Bone
          className="absolute left-[39%] -bottom-3 h-7 w-7 -rotate-[52deg] opacity-[0.17]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute left-[52%] top-1 h-6 w-6 rotate-[18deg] text-[#C9962F] opacity-[0.18]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-[66%] -bottom-2 h-7 w-7 rotate-[16deg] opacity-[0.17]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute left-[84%] top-1 h-6 w-6 rotate-[34deg] opacity-[0.16]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute right-[9%] -bottom-3 h-8 w-8 -rotate-[28deg] text-[#C9962F] opacity-[0.18]"
          strokeWidth={1.45}
        />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="shrink-0 rounded-lg border border-white/15 bg-white/10 p-2.5 text-sidebar-foreground hover:bg-white/15 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="hidden min-w-0 overflow-hidden rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/10 focus:outline-none min-[420px]:block sm:px-2"
          aria-label="Ir al dashboard"
        >
          <h2 className="truncate text-sm font-medium text-sidebar-foreground sm:text-base md:text-lg">
            Bienvenido, {user?.name}
          </h2>

          <p className="hidden truncate text-xs text-sidebar-foreground/70 sm:block sm:text-sm">
            {user?.role}
          </p>
        </button>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1 min-[380px]:gap-1.5 sm:gap-2 md:gap-4">
        <ThemeToggle />

        <div ref={notificationsRef} className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              void loadNotifications();
            }}
            className="relative rounded-lg border border-white/15 bg-white/10 p-2.5 text-sidebar-foreground transition-colors hover:bg-white/15 sm:p-3"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />

            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-sidebar bg-accent px-1 text-xs font-bold text-accent-foreground">
                {notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="fixed left-3 right-3 top-16 z-[100] rounded-xl border border-[#dbc8b2] bg-[#fffaf5] p-3 text-[#4a3525] shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                <h3 className="font-semibold text-[#4a3525]">
                  Notificaciones
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    onClick={restoreNotifications}
                    className="flex items-center gap-1 rounded-lg border border-[#d8b17e] bg-[#f5e3c9] px-2.5 py-1.5 text-xs font-medium text-[#825326] transition-colors hover:bg-[#ecd3ae]"
                    title="Restaurar notificaciones ocultas"
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={2.5} />
                    Restaurar
                  </button>

                  {notificationCount > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      className="rounded-md bg-[#ead9c7] px-2 py-1 text-xs text-[#6f4d32] transition-colors hover:bg-[#dfc5aa]"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              <div className="no-scrollbar max-h-80 space-y-2 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 rounded-lg border ${getNotificationStyle(
                        notification.type
                      )}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>

                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#4a3525]">
                            {notification.title}
                          </p>

                          <p className="text-sm text-[#604b38]">
                            {notification.message}
                          </p>

                          {notification.timeLabel && (
                            <p className="mt-1 text-xs text-[#E3B95F]">
                              {notification.timeLabel}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => dismissNotification(notification.id)}
                          className="rounded-lg p-1.5 text-[#70543c] transition-colors hover:bg-[#ead9c7] hover:text-[#4a3525]"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-[#604b38]">
                    No hay notificaciones nuevas
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 p-2.5 text-sidebar-foreground transition-colors hover:bg-white/15 sm:px-4 sm:py-2.5"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />

          <span className="hidden sm:inline font-medium">
            Cerrar sesión
          </span>
        </button>
      </div>
    </div>
  );
}
