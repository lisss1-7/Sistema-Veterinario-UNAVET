import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  BarChart3,
  Bone,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  House,
  LayoutDashboard,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Pill,
  Scissors,
  ShieldCheck,
  UsersRound,
  UserRound,
  X,
} from 'lucide-react';
import unavetLogo from '../assets/unavet-logo.png';
import {
  IS_FIRST_DELIVERY_MODE,
  type SystemModule,
} from '../config/deliveryScope';
import { preloadPatientsModule } from '../utils/patientsModuleData';

type SidebarProps = {
  isOpen?: boolean;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

// Acento cálido de marca, usado con moderación en los detalles del sidebar.
const TAG_ACCENT = '#C9962F';

const iconByModule = {
  dashboard: LayoutDashboard,
  patients: UsersRound,
  appointments: CalendarDays,
  grooming: Scissors,
  inventory: ClipboardCheck,
  prescriptions: Pill,
  aiReports: BarChart3,
  users: ShieldCheck,
  profile: UserRound,
} as const;

const authHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  return { Authorization: `Bearer ${token || ''}` };
};

const loadModuleCollection = async (endpoint: string) => {
  const response = await fetch(endpoint, { headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'No fue posible cargar los módulos.');
  return Array.isArray(data) ? (data as SystemModule[]) : [];
};

export function Sidebar({
  isOpen = false,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const location = useLocation();
  const [patientsExpanded, setPatientsExpanded] = useState(
    location.pathname.startsWith('/patients')
  );
  const [permittedModules, setPermittedModules] = useState<SystemModule[]>([]);
  const [systemModules, setSystemModules] = useState<SystemModule[]>([]);

  useEffect(() => {
    setPatientsExpanded(location.pathname.startsWith('/patients'));
  }, [location.pathname]);

  useEffect(() => {
    void Promise.all([
      loadModuleCollection('/api/catalogos/mis-modulos'),
      loadModuleCollection('/api/catalogos/modulos-sistema'),
    ])
      .then(([permitted, configured]) => {
        setPermittedModules(permitted);
        setSystemModules(configured);
      })
      .catch((error) => {
        console.error('Error al cargar los módulos del sistema:', error);
        setPermittedModules([]);
        setSystemModules([]);
      });
  }, []);

  const visibleModules = useMemo(() => {
    const permittedCodes = new Set(
      permittedModules.map((module) => module.codigo)
    );
    const source = IS_FIRST_DELIVERY_MODE ? systemModules : permittedModules;

    return source.filter(
      (module) =>
        module.codigo !== 'profile' &&
        (!IS_FIRST_DELIVERY_MODE ||
          module.codigo !== 'users' ||
          permittedCodes.has('users'))
    );
  }, [permittedModules, systemModules]);

  const navClass = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground'
    }`;

  const subNavClass = (active: boolean) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
      active
        ? 'bg-white/15 text-sidebar-foreground'
        : 'text-sidebar-foreground/65 hover:bg-white/10 hover:text-sidebar-foreground'
    }`;

  const iconChipClass = (active: boolean) =>
    `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
      active
        ? 'border-[#C9962F]/45 bg-[#C9962F]/20 text-[#E3B95F]'
        : 'border-white/10 bg-white/[0.06] text-sidebar-foreground/75 group-hover:border-white/20 group-hover:bg-white/10 group-hover:text-sidebar-foreground'
    }`;

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-dvh max-w-[82vw] flex-col overflow-hidden transition-[width,transform] duration-200 lg:translate-x-0 ${
        isCollapsed ? 'lg:w-20' : 'w-72 lg:w-64'
      } ${
        isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
      }`}
      style={{ background: 'var(--sidebar)' }}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden text-sidebar-foreground"
        aria-hidden="true"
      >
        <Bone
          className="absolute -right-1 top-[16%] h-7 w-7 rotate-[35deg] text-[#C9962F] opacity-[0.11]"
          strokeWidth={1.5}
        />
        <Bone
          className="absolute left-1 top-[28%] h-8 w-8 -rotate-[22deg] opacity-[0.09]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute right-1 top-[43%] h-9 w-9 rotate-[70deg] opacity-[0.1]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-0 top-[59%] h-7 w-7 rotate-[18deg] text-[#C9962F] opacity-[0.1]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute right-0 top-[73%] h-8 w-8 -rotate-[42deg] opacity-[0.09]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute left-1 bottom-[9%] h-9 w-9 rotate-[52deg] text-[#C9962F] opacity-[0.1]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute right-8 top-[34%] h-8 w-8 rotate-[18deg] text-[#C9962F] opacity-[0.13]"
          strokeWidth={1.45}
        />
        <PawPrint
          className="absolute left-10 top-[48%] h-7 w-7 -rotate-[28deg] opacity-[0.11]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute right-10 top-[66%] h-9 w-9 rotate-[35deg] opacity-[0.1]"
          strokeWidth={1.4}
        />
        <PawPrint
          className="absolute left-16 bottom-[19%] h-7 w-7 -rotate-[12deg] text-[#C9962F] opacity-[0.12]"
          strokeWidth={1.4}
        />
        <Bone
          className="absolute right-16 top-[22%] h-6 w-6 -rotate-[58deg] opacity-[0.08]"
          strokeWidth={1.3}
        />
        <PawPrint
          className="absolute left-20 top-[38%] h-6 w-6 rotate-[42deg] text-[#C9962F] opacity-[0.09]"
          strokeWidth={1.3}
        />
        <Bone
          className="absolute right-20 top-[57%] h-7 w-7 rotate-[12deg] opacity-[0.08]"
          strokeWidth={1.3}
        />
        <PawPrint
          className="absolute right-24 bottom-[27%] h-6 w-6 -rotate-[36deg] opacity-[0.09]"
          strokeWidth={1.3}
        />
      </div>

      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={onNavigate}
        className="absolute right-4 top-4 z-20 rounded-lg bg-white/10 p-2 text-sidebar-foreground hover:bg-white/20 lg:hidden"
      >
        <X className="h-5 w-5" />
      </button>

      <button
        type="button"
        aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
        title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
        onClick={onToggleCollapse}
        className="absolute right-4 top-4 z-20 hidden p-1.5 text-sidebar-foreground/65 transition-colors hover:text-sidebar-foreground lg:block"
      >
        {isCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      <div
        className={`relative z-10 flex flex-col items-center pb-5 pt-7 text-center ${
          isCollapsed ? 'px-2' : 'px-6'
        }`}
      >
        <NavLink
          to="/"
          onClick={onNavigate}
          className="group focus:outline-none"
          aria-label="Ir a la página principal"
        >
          <div className="mb-3 flex justify-center transition-transform group-hover:-translate-y-0.5">
            <img
              src={unavetLogo}
              alt="Logo UNAVET"
              className={`h-auto object-contain ${isCollapsed ? 'w-12' : 'w-24'}`}
            />
          </div>
          <p className={`w-full text-center text-sm font-medium text-sidebar-foreground/75 ${isCollapsed ? 'hidden' : ''}`}>
            Sistema Veterinario
          </p>
        </NavLink>
      </div>

      <nav className={`relative z-10 flex-1 overflow-y-auto py-4 no-scrollbar ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {visibleModules.map((module) => {
          const ModuleIcon =
            iconByModule[module.codigo as keyof typeof iconByModule] || House;

          if (module.codigo === 'patients') {
            const patientsActive = location.pathname.startsWith('/patients');

            return (
              <div key={module.codigo} className="mb-2">
                <NavLink
                  to={module.ruta}
                  onClick={() => setPatientsExpanded(true)}
                  onPointerEnter={preloadPatientsModule}
                  onFocus={preloadPatientsModule}
                  className={`${navClass(patientsActive)} ${isCollapsed ? 'justify-center px-2' : ''}`}
                  title={isCollapsed ? module.nombre : undefined}
                >
                  <span className={iconChipClass(patientsActive)}>
                    <ModuleIcon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className={`${isCollapsed ? 'hidden' : 'flex-1'} font-medium`}>
                    {module.nombre}
                  </span>
                  {patientsActive && (
                    <PawPrint
                      className={`h-3.5 w-3.5 shrink-0 ${isCollapsed ? 'hidden' : ''}`}
                      style={{ color: TAG_ACCENT }}
                      strokeWidth={2.4}
                    />
                  )}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      patientsExpanded ? 'rotate-180' : ''
                    } ${isCollapsed ? 'hidden' : ''}`}
                  />
                </NavLink>

                {patientsExpanded && !isCollapsed && (
                  <div className="ml-5 mt-2 space-y-1 border-l-2 border-dashed border-sidebar-border/70 pl-3">
                    <NavLink
                      to="/patients"
                      end
                      onClick={onNavigate}
                      className={({ isActive }) => subNavClass(isActive)}
                    >
                      <List className="h-4 w-4" />
                      Ver pacientes
                    </NavLink>
                    <NavLink
                      to="/patients/register"
                      onClick={onNavigate}
                      className={({ isActive }) => subNavClass(isActive)}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Registrar paciente
                    </NavLink>
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={module.codigo}
              to={module.ruta}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${navClass(isActive)} mb-2 ${isCollapsed ? 'justify-center px-2' : ''}`
              }
              title={isCollapsed ? module.nombre : undefined}
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <span className={iconChipClass(isActive)}>
                    <ModuleIcon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className={`${isCollapsed ? 'hidden' : 'flex-1'} font-medium`}>
                    {module.nombre}
                  </span>
                  {isActive && (
                    <PawPrint
                      className={`h-3.5 w-3.5 shrink-0 ${isCollapsed ? 'hidden' : ''}`}
                      style={{ color: TAG_ACCENT }}
                      strokeWidth={2.4}
                    />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

    
        
    </aside>
  );
}