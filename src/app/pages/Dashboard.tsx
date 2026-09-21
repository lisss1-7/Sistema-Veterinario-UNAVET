import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Bone,
  CalendarDays,
  ClipboardCheck,
  ChevronRight,
  FileText,
  House,
  PawPrint,
  Scissors,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import {
  IS_FIRST_DELIVERY_MODE,
  isModuleContentEnabled,
  type SystemModule,
} from '../config/deliveryScope';
import { API_URL } from '../config/api';

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

const moduleIconByCode: Record<string, LucideIcon> = {
  dashboard: House,
  patients: UsersRound,
  appointments: CalendarDays,
  grooming: Scissors,
  inventory: ClipboardCheck,
  prescriptions: FileText,
  aiReports: BarChart3,
  users: ShieldCheck,
};

const quickAccessStyles = [
  'border-[#806548] bg-[#806548] text-[#fffaf3] hover:border-[#6f553a] hover:bg-[#6f553a] dark:border-[#957657] dark:bg-[#60462f] dark:hover:bg-[#6f553a]',
  'border-[#d19a5b] bg-[#d19a5b] text-[#33251a] hover:border-[#bd8548] hover:bg-[#bd8548] dark:border-[#a97643] dark:bg-[#704b2b] dark:text-[#fffaf3] dark:hover:bg-[#805934]',
  'border-[#b97858] bg-[#b97858] text-[#33251a] hover:border-[#a86548] hover:bg-[#a86548] dark:border-[#a66d55] dark:bg-[#6f4133] dark:text-[#fffaf3] dark:hover:bg-[#7e4c3c]',
  'border-[#c4a27a] bg-[#c4a27a] text-[#33251a] hover:border-[#b38e65] hover:bg-[#b38e65] dark:border-[#9d8062] dark:bg-[#654d38] dark:text-[#fffaf3] dark:hover:bg-[#755b43]',
];

type DashboardCache = {
  todayAppointments: any[];
  todayGrooming: any[];
  upcomingVaccinations: any[];
  modules: SystemModule[];
};

let dashboardCache: DashboardCache | null = null;

const loadModules = async (allSystemModules: boolean) => {
  const endpoint = allSystemModules ? 'modulos-sistema' : 'mis-modulos';
  const response = await fetch(`${API_URL}/catalogos/${endpoint}`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'No fue posible cargar los módulos.');
  }

  return (Array.isArray(data) ? data : []) as SystemModule[];
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const getFormattedToday = () => {
  const raw = new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[90px] rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
      <p className="text-2xl font-bold leading-none text-[#fffaf3]">{value}</p>
      <p className="mt-1.5 text-xs text-[#f1e2cf]">{label}</p>
    </div>
  );
}

function FullDashboard() {
  const navigate = useNavigate();

  const [todayAppointments, setTodayAppointments] = useState<any[]>(
    () => dashboardCache?.todayAppointments || []
  );
  const [todayGrooming, setTodayGrooming] = useState<any[]>(
    () => dashboardCache?.todayGrooming || []
  );
  const [upcomingVaccinations, setUpcomingVaccinations] = useState<any[]>(
    () => dashboardCache?.upcomingVaccinations || []
  );
  const [modules, setModules] = useState<SystemModule[]>(
    () => dashboardCache?.modules || []
  );
  const [isLoading, setIsLoading] = useState(!dashboardCache);

  useEffect(() => {
    void Promise.all([
      fetch(`${API_URL}/dashboard/resumen`, {
        method: 'GET',
        headers: getAuthHeaders(),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Error al cargar la página principal.');
        }
        return data;
      }),
      loadModules(false),
    ])
      .then(([summary, permittedModules]) => {
        const nextCache = {
          todayAppointments: summary.todayAppointments || [],
          todayGrooming: summary.todayGrooming || [],
          upcomingVaccinations: summary.upcomingVaccinations || [],
          modules: permittedModules,
        };
        dashboardCache = nextCache;
        setTodayAppointments(nextCache.todayAppointments);
        setTodayGrooming(nextCache.todayGrooming);
        setUpcomingVaccinations(nextCache.upcomingVaccinations);
        setModules(nextCache.modules);
      })
      .catch((error) => {
        console.error('Error al cargar la página principal:', error);
        setTodayAppointments([]);
        setTodayGrooming([]);
        setUpcomingVaccinations([]);
        setModules([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const quickAccessModules = modules
    .filter((module) => !['dashboard', 'profile'].includes(module.codigo))
    .slice(0, 4);

  const reminders = [
    ...todayAppointments.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.petName || 'Paciente sin nombre',
      description: `${item.time || 'Hora por confirmar'} · ${item.tutorName || 'Tutor no registrado'}`,
      tag: 'Cita',
      tone: 'amber' as const,
      target: '/appointments',
      targetState: { highlightAppointmentId: item.id },
    })),
    ...todayGrooming.slice(0, 2).map((item) => ({
      id: item.id,
      title: item.petName || 'Paciente sin nombre',
      description: `${item.time || 'Hora por confirmar'} · ${item.type || 'Grooming'}`,
      tag: 'Grooming',
      tone: 'terracotta' as const,
      target: '/grooming',
      targetState: { highlightGroomingId: item.id },
    })),
    ...upcomingVaccinations.slice(0, 3).map((item) => ({
      id: item.patientId,
      title: item.title || item.petName || 'Paciente sin nombre',
      description: item.description || `${item.vaccine || 'Vacuna'} · Próxima dosis ${item.date || ''}`,
      tag: item.tag || 'Vacuna',
      tone: (item.tone || 'amber') as 'amber' | 'terracotta',
      target: item.patientId ? `/patients/${item.patientId}` : '/patients',
      targetState: item.patientId ? { activeTab: 'vaccination' } : undefined,
    })),
  ];

  return (
    <div className="dashboard-page relative min-h-full overflow-hidden w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute right-10 top-0 h-[58%] border-l border-dashed border-[#b97858]/30" />
        <div className="absolute bottom-0 left-10 h-[38%] border-l border-dashed border-[#a66d35]/30" />
        <div className="absolute right-0 top-0 h-2 w-48 bg-[#b97858]/40" />
        <div className="absolute bottom-0 left-0 h-2 w-40 bg-[#c9965a]/40" />
        <PawPrint className="absolute -right-8 top-8 h-36 w-36 rotate-12 text-[#c9965a] opacity-[0.18]" strokeWidth={1} />
        <Bone className="absolute right-[22%] top-[23%] h-14 w-14 -rotate-[28deg] text-[#a66d35] opacity-[0.14]" strokeWidth={1.1} />
        <PawPrint className="absolute -left-8 bottom-12 h-32 w-32 -rotate-12 text-[#b97858] opacity-[0.16]" strokeWidth={1} />
        <Bone className="absolute left-[38%] bottom-[8%] h-12 w-12 rotate-[35deg] text-[#c9965a] opacity-[0.14]" strokeWidth={1.1} />
        <PawPrint className="absolute right-[8%] top-[48%] h-9 w-9 -rotate-[22deg] text-[#a66d35] opacity-[0.13]" strokeWidth={1.2} />
        <Bone className="absolute left-[12%] top-[38%] h-8 w-8 rotate-[54deg] text-[#b97858] opacity-[0.13]" strokeWidth={1.1} />
      </div>

      {/* Hero */}
      <div className="relative z-10 mb-8 overflow-hidden rounded-2xl border border-[#5c4230] bg-gradient-to-br from-[#3b2a1e] via-[#6b4226] to-[#a9703f] p-6 shadow-md md:p-8">
        <PawPrint className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 rotate-12 text-[#fffaf3] opacity-[0.08]" strokeWidth={1} />
        <PawPrint className="pointer-events-none absolute -bottom-8 left-[42%] h-28 w-28 -rotate-[18deg] text-[#fffaf3] opacity-[0.06]" strokeWidth={1} />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[#f1d8bc]">{getFormattedToday()}</p>
            <h1 className="mt-1 text-xl font-bold text-[#fffaf3] md:text-2xl">
              {getGreeting()}
            </h1>
            <p className="mt-2 max-w-md text-sm text-[#f1e2cf]">
              Este es el resumen de actividad de la clínica para hoy.
            </p>
          </div>

          <div className="flex gap-3">
            <StatChip label="Citas hoy" value={todayAppointments.length} />
            <StatChip label="Grooming hoy" value={todayGrooming.length} />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="mb-8 rounded-xl border border-[#dbc8b2] bg-[#fffaf5] p-6 shadow-sm dark:border-[#705b4d] dark:bg-[#40332b]">
          <p className="text-muted-foreground">Cargando información del sistema...</p>
        </div>
      )}

      <section className="relative z-10 mb-8 rounded-2xl border border-[#ddc9b4] bg-[#fffaf5]/75 p-5 shadow-sm backdrop-blur-[2px] dark:border-[#705b4d] dark:bg-[#40332b]/80 md:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-xl font-semibold text-[#4a3525] dark:text-[#f7efe6]">Accesos rápidos</h2>
          <PawPrint className="h-7 w-7 text-[#c9965a]" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`quick-access-skeleton-${index}`}
                className="h-[68px] animate-pulse rounded-lg bg-[#dfcdb9] dark:bg-[#56453d]"
              />
            ))}
          {quickAccessModules.map((module, index) => {
            const ModuleIcon = moduleIconByCode[module.codigo] || House;
            return (
              <Link
                key={module.codigo}
                to={module.ruta}
                className={`group flex items-center gap-3 rounded-lg border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  quickAccessStyles[index % quickAccessStyles.length]
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 transition-colors group-hover:bg-white/25">
                  <ModuleIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="flex-1 font-semibold">{module.nombre}</span>
                <ChevronRight className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-70" />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyList
          title="Próximas citas del día"
          icon={CalendarDays}
          items={todayAppointments}
          emptyText="No hay citas para hoy"
          accent="amber"
          onItemClick={(item) =>
            navigate('/appointments', {
              state: { highlightAppointmentId: item.id },
            })
          }
        />
        <DailyList
          title="Grooming del día"
          icon={Scissors}
          items={todayGrooming}
          emptyText="No hay citas de grooming para hoy"
          accent="terracotta"
          onItemClick={(item) => navigate('/grooming', { state: { highlightGroomingId: item.id } })}
        />
      </div>

      <section className="relative z-10 mt-8 rounded-2xl border border-[#ddc9b4] bg-[#fffaf5] p-5 shadow-sm dark:border-[#705b4d] dark:bg-[#40332b]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-foreground dark:text-[#f7efe6]">
            Recordatorios
          </h2>
          <span className="rounded-full border border-[#d9c0a4] bg-[#f6eadb] p-2 text-[#775d48] dark:border-[#826454] dark:bg-[#56453d] dark:text-[#f1d8bc]">
            <Bell className="h-4 w-4" />
          </span>
        </div>

        {reminders.length > 0 ? (
          <div className="relative space-y-5 pl-6">
            <div className="absolute bottom-1 left-[7px] top-1 w-px bg-[#e4d2bc] dark:bg-[#6b5644]" />
            {reminders.map((item, index) => (
              <button
                key={`${item.title}-${index}`}
                type="button"
                onClick={() => navigate(item.target, { state: item.targetState })}
                className="relative block w-full cursor-pointer text-left transition-opacity hover:opacity-90"
              >
                <span
                  className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#fffaf5] dark:border-[#40332b] ${
                    item.tone === 'amber' ? 'bg-[#b98142]' : 'bg-[#b97858]'
                  }`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-foreground dark:text-[#f7efe6]">{item.title}</p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      item.tone === 'amber'
                        ? 'border-[#d8b17e] bg-[#f5e3c9] text-[#825326] dark:border-[#8b6f47] dark:bg-[#554337] dark:text-[#f0c982]'
                        : 'border-[#e0b9a8] bg-[#f5e0d7] text-[#884b39] dark:border-[#93614f] dark:bg-[#5a3f35] dark:text-[#efb39a]'
                    }`}
                  >
                    {item.tag}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground dark:text-[#d7c7ba]">
                  {item.description}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#dbc8b2] bg-[#fbf6f0] p-8 text-center dark:border-[#705b4d] dark:bg-[#43362e]">
            <Bell className="h-6 w-6 text-[#c9965a]" strokeWidth={1.5} />
            <p className="text-[#8a7664] dark:text-[#c8b5a4]">No tienes recordatorios para hoy.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DailyList({
  title,
  icon: SectionIcon,
  items,
  emptyText,
  accent,
  onItemClick,
}: {
  title: string;
  icon: LucideIcon;
  items: any[];
  emptyText: string;
  accent: 'amber' | 'terracotta';
  onItemClick?: (item: any) => void;
}) {
  const accentStyles = accent === 'amber'
    ? {
        border: 'border-[#dbc8b2] dark:border-[#705b4d]',
        icon: 'border-[#b98142] bg-[#b98142] text-[#fffaf3]',
        detail: 'text-[#a66d35] dark:text-[#e0b878]',
        badge: 'border-[#d8b17e] bg-[#f5e3c9] text-[#825326] dark:border-[#8b6f47] dark:bg-[#554337] dark:text-[#f0c982]',
        accentBar: 'bg-[#b98142]',
      }
    : {
        border: 'border-[#dfc1b4] dark:border-[#705b4d]',
        icon: 'border-[#b97858] bg-[#b97858] text-[#fffaf3]',
        detail: 'text-[#a45f48] dark:text-[#e3a58c]',
        badge: 'border-[#e0b9a8] bg-[#f5e0d7] text-[#884b39] dark:border-[#93614f] dark:bg-[#5a3f35] dark:text-[#efb39a]',
        accentBar: 'bg-[#b97858]',
      };

  return (
    <section className={`rounded-xl border bg-[#fffaf5] p-6 shadow-sm dark:bg-[#40332b] ${accentStyles.border}`}>
      <h2 className="mb-4 flex items-center gap-3 text-xl font-semibold text-foreground dark:text-[#f7efe6]">
        <span className={`rounded-md border p-2 ${accentStyles.icon}`}>
          <SectionIcon className="h-5 w-5" strokeWidth={2} />
        </span>
        {title}
      </h2>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick?.(item)}
              className="relative block w-full overflow-hidden rounded-lg border border-[#ead9c7] bg-[#fbf5ee] p-4 pl-5 text-left transition-colors hover:bg-[#f6ead9] dark:border-[#705b4d] dark:bg-[#49392f] dark:hover:bg-[#503f34] sm:flex sm:flex-row sm:items-center sm:justify-between"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${accentStyles.accentBar}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground dark:text-[#f7efe6]">{item.petName}</p>
                <p className="text-sm text-muted-foreground dark:text-[#d7c7ba]">{item.tutorName}</p>
                <p className={`text-sm ${accentStyles.detail}`}>{item.reason || item.type}</p>
              </div>
              <div className="mt-3 sm:mt-0 sm:text-right">
                <p className={`font-bold ${accentStyles.detail}`}>{item.time}</p>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${accentStyles.badge}`}>
                  {item.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-[#8a7664] dark:text-[#c8b5a4]">{emptyText}</p>
      )}
    </section>
  );
}

function FirstDeliveryDashboard() {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void loadModules(true)
      .then((data) => {
        setModules(data.filter((module) => module.codigo !== 'profile'));
        setLoadError('');
      })
      .catch((error) => {
        console.error('Error al cargar los módulos del sistema:', error);
        setModules([]);
        setLoadError('No fue posible consultar los módulos configurados.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="mb-8 overflow-hidden rounded-2xl border border-[#5c4230] bg-gradient-to-br from-[#3b2a1e] via-[#6b4226] to-[#a9703f] p-6 shadow-md md:p-8">
        <h1 className="text-xl font-bold text-[#fffaf3] md:text-2xl">
          Página principal del sistema
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#f1e2cf]">
          Módulos configurados para la gestión veterinaria UNAVET.
        </p>
      </div>

      <section aria-labelledby="system-modules-title">
        <h2 id="system-modules-title" className="mb-5 text-xl font-semibold text-foreground">
          Módulos del sistema
        </h2>

        {isLoading && (
          <p className="rounded-xl border border-border bg-card p-5 text-muted-foreground">
            Cargando módulos configurados...
          </p>
        )}

        {loadError && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
            {loadError}
          </p>
        )}

        {!isLoading && !loadError && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const ModuleIcon = moduleIconByCode[module.codigo] || House;
              const included = isModuleContentEnabled(module.codigo);

              return (
                <Link
                  key={module.codigo}
                  to={module.ruta}
                  className="group flex min-h-40 flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/40 hover:shadow-md"
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <span className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary">
                      <ModuleIcon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        included
                          ? 'border-primary/25 bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground'
                      }`}
                    >
                      {included ? 'Incluido' : 'Próxima entrega'}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">
                      {module.nombre}
                    </h3>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Dashboard() {
  return <FullDashboard />;
}
