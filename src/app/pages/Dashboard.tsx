import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Bone,
  CalendarDays,
  ClipboardCheck,
  ChevronRight,
  ClipboardList,
  FileText,
  House,
  PawPrint,
  Scissors,
  ShieldCheck,
} from 'lucide-react';
import {
  IS_FIRST_DELIVERY_MODE,
  isModuleContentEnabled,
  type SystemModule,
} from '../config/deliveryScope';

const API_URL = '/api';

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
  patients: ClipboardList,
  appointments: CalendarDays,
  grooming: Scissors,
  inventory: ClipboardCheck,
  prescriptions: FileText,
  aiReports: BarChart3,
  users: ShieldCheck,
};

const quickAccessStyles = [
  'border-[#806548] bg-[#806548] text-[#fffaf3] hover:border-[#6f553a] hover:bg-[#6f553a]',
  'border-[#d19a5b] bg-[#d19a5b] text-[#fffaf3] hover:border-[#bd8548] hover:bg-[#bd8548]',
  'border-[#b97858] bg-[#b97858] text-[#fffaf3] hover:border-[#a86548] hover:bg-[#a86548]',
  'border-[#c4a27a] bg-[#c4a27a] text-[#33251a] hover:border-[#b38e65] hover:bg-[#b38e65]',
];

type DashboardCache = {
  todayAppointments: any[];
  todayGrooming: any[];
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

function FullDashboard() {
  const [todayAppointments, setTodayAppointments] = useState<any[]>(
    () => dashboardCache?.todayAppointments || []
  );
  const [todayGrooming, setTodayGrooming] = useState<any[]>(
    () => dashboardCache?.todayGrooming || []
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
          modules: permittedModules,
        };
        dashboardCache = nextCache;
        setTodayAppointments(nextCache.todayAppointments);
        setTodayGrooming(nextCache.todayGrooming);
        setModules(nextCache.modules);
      })
      .catch((error) => {
        console.error('Error al cargar la página principal:', error);
        setTodayAppointments([]);
        setTodayGrooming([]);
        setModules([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const quickAccessModules = modules
    .filter((module) => !['dashboard', 'profile'].includes(module.codigo))
    .slice(0, 4);

  const reminders = [
    ...todayAppointments.slice(0, 3).map((item) => ({
      title: item.petName || 'Paciente sin nombre',
      description: `${item.time || 'Hora por confirmar'} · ${item.tutorName || 'Tutor no registrado'}`,
      tag: 'Cita',
      tone: 'amber',
    })),
    ...todayGrooming.slice(0, 2).map((item) => ({
      title: item.petName || 'Paciente sin nombre',
      description: `${item.time || 'Hora por confirmar'} · ${item.type || 'Grooming'}`,
      tag: 'Grooming',
      tone: 'terracotta',
    })),
  ];

  return (
    <div
      className="dashboard-page relative min-h-full overflow-hidden p-4 md:p-8"
    >
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

      <div className="relative z-10 mb-8 border-b border-[#d7c1aa] pb-6 dark:border-[#705b4d]">
        <h1 className="mb-2 text-2xl font-bold text-[#422e1f] md:text-3xl dark:text-[#f7efe6]">
          Dashboard
        </h1>

      </div>

      {isLoading && (
        <div className="mb-8 rounded-xl border border-[#dbc8b2] bg-[#fffaf5] p-6 shadow-sm dark:border-[#705b4d] dark:bg-[#40332b]">
          <p className="text-muted-foreground">Cargando información del sistema...</p>
        </div>
      )}

      <section className="relative z-10 mb-8 rounded-2xl border border-[#ddc9b4] bg-[#fffaf5]/75 p-5 shadow-sm backdrop-blur-[2px] dark:border-[#705b4d] dark:bg-[#40332b]/80 md:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#4a3525] dark:text-[#f7efe6]">Accesos rápidos</h2>
          </div>
          <PawPrint className="h-7 w-7 text-[#c9965a]" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`quick-access-skeleton-${index}`}
                className="h-[68px] animate-pulse rounded-lg bg-[#dfcdb9]"
              />
            ))}
          {quickAccessModules.map((module, index) => {
            const ModuleIcon = moduleIconByCode[module.codigo] || House;
            return (
              <Link
                key={module.codigo}
                to={module.ruta}
                className={`group flex items-center gap-3 rounded-lg border p-4 shadow-sm transition-colors ${
                  quickAccessStyles[index % quickAccessStyles.length]
                }`}
              >
                <span className="rounded-md border border-white/25 bg-white/15 p-2 transition-colors group-hover:bg-white/20">
                  <ModuleIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="font-semibold">{module.nombre}</span>
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
        />
        <DailyList
          title="Grooming del día"
          icon={Scissors}
          items={todayGrooming}
          emptyText="No hay citas de grooming para hoy"
          accent="terracotta"
        />
      </div>

      <section className="relative z-10 mt-8 rounded-2xl border border-[#ddc9b4] bg-[#fffaf5] p-5 shadow-sm dark:border-[#705b4d] dark:bg-[#40332b]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-foreground dark:text-[#f7efe6]">
            Recordatorios
          </h2>
          <span className="rounded-full border border-[#d9c0a4] bg-[#f6eadb] p-2 text-[#775d48] dark:border-[#826454] dark:bg-[#56453d] dark:text-[#f1d8bc]">
            <Bell className="h-4 w-4" />
          </span>
        </div>

        {reminders.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reminders.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`rounded-xl border p-4 ${
                  item.tone === 'amber'
                    ? 'border-[#ead4aa] bg-[#fff7ec] dark:border-[#7b6147] dark:bg-[#4b382d]'
                    : 'border-[#e7bfaf] bg-[#fff3ee] dark:border-[#7a564d] dark:bg-[#4b312d]'
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="rounded-full border border-[#d9c0a4] bg-[#f6eadb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#775d48] dark:border-[#826454] dark:bg-[#56453d] dark:text-[#f1d8bc]">
                    {item.tag}
                  </span>
                </div>

                <p className="font-semibold text-foreground dark:text-[#f7efe6]">
                  {item.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground dark:text-[#d7c7ba]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#dbc8b2] bg-[#fbf6f0] p-6 text-center text-[#8a7664] dark:border-[#705b4d] dark:bg-[#43362e] dark:text-[#c8b5a4]">
            No tienes recordatorios para hoy.
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
}: {
  title: string;
  icon: LucideIcon;
  items: any[];
  emptyText: string;
  accent: 'amber' | 'terracotta';
}) {
  const accentStyles = accent === 'amber'
    ? {
        border: 'border-[#dbc8b2] dark:border-[#705b4d]',
        icon: 'border-[#b98142] bg-[#b98142] text-[#fffaf3]',
        detail: 'text-[#a66d35] dark:text-[#e0b878]',
        badge: 'border-[#d8b17e] bg-[#f5e3c9] text-[#825326] dark:border-[#8b6f47] dark:bg-[#554337] dark:text-[#f0c982]',
      }
    : {
        border: 'border-[#dfc1b4] dark:border-[#705b4d]',
        icon: 'border-[#b97858] bg-[#b97858] text-[#fffaf3]',
        detail: 'text-[#a45f48] dark:text-[#e3a58c]',
        badge: 'border-[#e0b9a8] bg-[#f5e0d7] text-[#884b39] dark:border-[#93614f] dark:bg-[#5a3f35] dark:text-[#efb39a]',
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
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-[#ead9c7] bg-[#fbf5ee] p-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#705b4d] dark:bg-[#49392f]"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground dark:text-[#f7efe6]">{item.petName}</p>
                <p className="text-sm text-muted-foreground dark:text-[#d7c7ba]">{item.tutorName}</p>
                <p className={`text-sm ${accentStyles.detail}`}>{item.reason || item.type}</p>
              </div>
              <div className="sm:text-right">
                <p className={`font-bold ${accentStyles.detail}`}>{item.time}</p>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${accentStyles.badge}`}>
                  {item.status}
                </span>
              </div>
            </div>
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
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
            Página principal del sistema
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Módulos configurados para la gestión veterinaria UNAVET.
          </p>
        </div>
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
                  className="group flex min-h-40 flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
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
