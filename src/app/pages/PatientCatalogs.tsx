import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FlaskConical,
  PawPrint,
  Plus,
  Power,
  RotateCcw,
  Search,
  Settings2,
  Stethoscope,
  Trash2,
  X,
  ClipboardCheck,
  BriefcaseBusiness,
  Pill,
  ShieldCheck,
  Type,
  type LucideIcon,
} from 'lucide-react';
import ThemedSelect from '../components/ThemedSelect';
import { API_URL } from '../config/api';
import { getAuthHeaders } from '../utils/apiClient';

type CatalogDefinition = {
  key: string;
  label: string;
  singular: string;
  gender?: 'masculine' | 'feminine';
  description: string;
  icon: LucideIcon;
  hasActive?: boolean;
  requiresSpecies?: boolean;
  hasIntervalValues?: boolean;
  hasDescription?: boolean;
  requiresServiceCategory?: boolean;
  hasPrice?: boolean;
  hasInventoryControl?: boolean;
  managesPermissions?: boolean;
  readOnly?: boolean;
};

type CatalogGroup = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  moduleCode: string;
  catalogs: CatalogDefinition[];
};

type CatalogRow = {
  id: number;
  nombre: string;
  activo?: number | boolean;
  especie_id?: number;
  especie_nombre?: string;
  especie_activa?: number | boolean;
  dias_por_unidad?: number | string | null;
  meses_por_unidad?: number | string | null;
  descripcion?: string | null;
  categoria_servicio_id?: number;
  categoria_nombre?: string;
  precio_base?: number | string | null;
  controla_inventario?: number | boolean;
  permisos?: RolePermission[];
};

type PermissionAction =
  | 'puede_ver'
  | 'puede_crear'
  | 'puede_editar'
  | 'puede_eliminar';

type RolePermission = Record<PermissionAction, boolean | number> & {
  codigo: string;
  modulo_nombre: string;
};

type SystemModule = {
  codigo: string;
  nombre: string;
};

type PatientPermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type FormState = {
  nombre: string;
  especie_id: string;
  dias_por_unidad: string;
  meses_por_unidad: string;
  descripcion: string;
  categoria_servicio_id: string;
  precio_base: string;
  controla_inventario: boolean;
  permisos: RolePermission[];
};

type SortOption = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

type PendingConfirmation =
  | {
      type: 'update';
      record: CatalogRow;
      payload: Record<string, unknown>;
    }
  | {
      type: 'deactivate' | 'reactivate' | 'delete';
      record: CatalogRow;
    };

const CATALOG_API_URL = `${API_URL}/catalogos/proceso-pacientes`;

const CATALOG_GROUPS: readonly CatalogGroup[] = [
  {
    key: 'pacientes',
    label: 'Pacientes',
    description: 'Catálogos para el registro y expediente de pacientes.',
    icon: PawPrint,
    moduleCode: 'patients',
    catalogs: [
      { key: 'razas', label: 'Razas', singular: 'raza', description: 'Razas asociadas a una especie.', icon: PawPrint, hasActive: true, requiresSpecies: true },
      { key: 'tipos-consulta', label: 'Tipos de consulta', singular: 'tipo de consulta', gender: 'masculine', description: 'Clasificación de las consultas.', icon: Stethoscope },
      { key: 'pruebas-laboratorio', label: 'Pruebas de laboratorio', singular: 'prueba de laboratorio', description: 'Exámenes disponibles.', icon: FlaskConical },
    ],
  },
  {
    key: 'inventario',
    label: 'Inventario',
    description: 'Catálogos de productos y categorías.',
    icon: ClipboardCheck,
    moduleCode: 'inventory',
    catalogs: [
      { key: 'categorias-inventario', label: 'Categorías', singular: 'categoría', description: 'Categorías de productos.', icon: Type, hasActive: true },
      { key: 'unidades-medida', label: 'Unidades de medida', singular: 'unidad', description: 'Unidades para stock.', icon: Type, hasActive: true },
    ],
  },
  {
    key: 'tratamientos',
    label: 'Tratamientos y Recetas',
    description: 'Catálogos clínicos y de medicación.',
    icon: Pill,
    moduleCode: 'prescriptions',
    catalogs: [
      { key: 'tipos-tratamiento', label: 'Tipos de tratamiento', singular: 'tipo', gender: 'masculine', description: 'Tratamientos clínicos.', icon: Type },
      { key: 'modos-entrega', label: 'Modos de entrega', singular: 'modo', gender: 'masculine', description: 'Formas de entregar recetas.', icon: Type, hasActive: true },
      { key: 'estados-tratamiento', label: 'Estados de tratamiento', singular: 'estado', gender: 'masculine', description: 'Estados de un tratamiento.', icon: Type },
    ],
  },
  {
    key: 'servicios',
    label: 'Servicios',
    description: 'Servicios disponibles y sus categorías.',
    icon: BriefcaseBusiness,
    moduleCode: 'prescriptions',
    catalogs: [
      { key: 'categorias-servicio', label: 'Categorías de servicio', singular: 'categoría', description: 'Clasificación de los servicios ofrecidos.', icon: Type, hasActive: true, hasDescription: true },
      { key: 'servicios', label: 'Servicios', singular: 'servicio', gender: 'masculine', description: 'Servicios ofrecidos por la clínica.', icon: BriefcaseBusiness, hasActive: true, hasDescription: true, requiresServiceCategory: true, hasPrice: true, hasInventoryControl: true },
    ],
  },
  {
    key: 'usuarios',
    label: 'Usuarios',
    description: 'Catálogos del sistema.',
    icon: ShieldCheck,
    moduleCode: 'users',
    catalogs: [
      { key: 'roles', label: 'Roles', singular: 'rol', gender: 'masculine', description: 'Roles y permisos de acceso al sistema.', icon: Type, hasActive: true, managesPermissions: true },
    ],
  },
];

const EMPTY_FORM: FormState = {
  nombre: '',
  especie_id: '',
  dias_por_unidad: '',
  meses_por_unidad: '',
  descripcion: '',
  categoria_servicio_id: '',
  precio_base: '',
  controla_inventario: false,
  permisos: [],
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const toBoolean = (value: unknown) =>
  value === true || value === 1 || value === '1';

export default function PatientCatalogs() {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(CATALOG_GROUPS[0].key);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);

  const selectedCatalogRef = useRef<string | null>(null);
  const catalogRequest = useRef(0);
  const [records, setRecords] = useState<CatalogRow[]>([]);
  const [species, setSpecies] = useState<CatalogRow[]>([]);
  const [serviceCategories, setServiceCategories] = useState<CatalogRow[]>([]);
  const [systemModules, setSystemModules] = useState<SystemModule[]>([]);
  const [modulePermissions, setModulePermissions] = useState<Record<string, PatientPermissions> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);

  const currentGroup = CATALOG_GROUPS.find(g => g.key === selectedGroupKey) || CATALOG_GROUPS[0];
  const catalog = currentGroup.catalogs.find((item) => item.key === selectedCatalog) || currentGroup.catalogs[0];
  const CatalogIcon = catalog.icon;
  const catalogHasDetail = Boolean(
    catalog.requiresSpecies ||
      catalog.hasDescription ||
      catalog.requiresServiceCategory ||
      catalog.hasPrice ||
      catalog.hasInventoryControl ||
      catalog.managesPermissions
  );
  const permissions = modulePermissions?.[currentGroup.moduleCode] || {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };

  const loadPermissions = async () => {
    try {
      const response = await fetch(`${API_URL}/catalogos/mis-modulos`, {
        headers: getAuthHeaders(),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible validar los permisos');
      }

      const loadedPermissions: Record<string, PatientPermissions> = {};
      if (Array.isArray(data)) {
        data.forEach((module) => {
          loadedPermissions[module.codigo] = {
            canView: Boolean(module.puede_ver),
            canCreate: Boolean(module.puede_crear),
            canEdit: Boolean(module.puede_editar),
            canDelete: Boolean(module.puede_eliminar),
          };
        });
      }
      setModulePermissions(loadedPermissions);
      const firstVisibleGroup = CATALOG_GROUPS.find(
        (group) => loadedPermissions[group.moduleCode]?.canView
      );
      if (firstVisibleGroup) setSelectedGroupKey(firstVisibleGroup.key);
    } catch (permissionError) {
      setModulePermissions({});
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : 'No fue posible validar los permisos'
      );
    }
  };

  const loadCatalog = async (key: string) => {
    if (selectedCatalogRef.current !== key) return;
    const requestId = ++catalogRequest.current;
    setLoading(true);
    setError('');
    try {
      const requests: Promise<Response>[] = [
        fetch(`${CATALOG_API_URL}/${key}`, { headers: getAuthHeaders() }),
      ];
      if (catalog.requiresSpecies) {
        requests.push(
          fetch(`${CATALOG_API_URL}/especies`, { headers: getAuthHeaders() })
        );
      }
      if (catalog.requiresServiceCategory) {
        requests.push(
          fetch(`${CATALOG_API_URL}/categorias-servicio`, { headers: getAuthHeaders() })
        );
      }
      if (catalog.managesPermissions) {
        requests.push(
          fetch(`${API_URL}/catalogos/modulos-sistema`, { headers: getAuthHeaders() })
        );
      }

      const responses = await Promise.all(requests);
      const responseData = await Promise.all(responses.map(parseResponse));
      const data = responseData[0];
      if (requestId !== catalogRequest.current) return;
      if (!responses[0].ok) {
        throw new Error(data.message || 'No fue posible cargar el catálogo');
      }
      setRecords(Array.isArray(data) ? data : []);

      let auxiliaryIndex = 1;
      if (catalog.requiresSpecies) {
        const speciesData = responseData[auxiliaryIndex];
        if (!responses[auxiliaryIndex].ok) {
          throw new Error(
            speciesData.message || 'No fue posible cargar las especies'
          );
        }
        setSpecies(Array.isArray(speciesData) ? speciesData : []);
        auxiliaryIndex += 1;
      }
      if (catalog.requiresServiceCategory) {
        const categoryData = responseData[auxiliaryIndex];
        if (!responses[auxiliaryIndex].ok) {
          throw new Error(categoryData.message || 'No fue posible cargar las categorías');
        }
        setServiceCategories(Array.isArray(categoryData) ? categoryData : []);
        auxiliaryIndex += 1;
      }
      if (catalog.managesPermissions) {
        const modulesData = responseData[auxiliaryIndex];
        if (!responses[auxiliaryIndex].ok) {
          throw new Error(modulesData.message || 'No fue posible cargar los módulos');
        }
        setSystemModules(Array.isArray(modulesData) ? modulesData : []);
      }
    } catch (loadError) {
      if (requestId !== catalogRequest.current) return;
      setRecords([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar el catálogo'
      );
    } finally {
      if (requestId === catalogRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPermissions();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSearchTerm('');
    setShowForm(false);
    setEditingRecord(null);
    setForm(EMPTY_FORM);

    if (permissions?.canView && selectedCatalog) {
      void loadCatalog(selectedCatalog);
    } else if (permissions) {
      setLoading(false);
    }
    return () => { catalogRequest.current += 1; };
  }, [selectedCatalog, permissions.canView]);

  const selectCatalog = (key: string) => {
    if (key === selectedCatalog) return;
    selectedCatalogRef.current = key;
    catalogRequest.current += 1;
    setRecords([]);
    setSpecies([]);
    setServiceCategories([]);
    setSystemModules([]);
    setLoading(true);
    setError('');
    setSelectedCatalog(key);
  };

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('es');
    const filtered = records.filter((record) => {
      if (!term) return true;
      return [record.nombre, record.especie_nombre, record.descripcion, record.categoria_nombre]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('es').includes(term)
        );
    });

    return [...filtered].sort((left, right) => {
      if (sortOption === 'id-asc') return Number(left.id) - Number(right.id);
      if (sortOption === 'id-desc') return Number(right.id) - Number(left.id);

      const comparison = String(left.nombre).localeCompare(
        String(right.nombre),
        'es',
        { sensitivity: 'base' }
      );
      return sortOption === 'name-desc' ? -comparison : comparison;
    });
  }, [records, searchTerm, sortOption]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / pageSize)
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOption, pageSize]);

  const openCreateForm = () => {
    const firstActiveSpecies = species.find((item) => toBoolean(item.activo));
    setEditingRecord(null);
    setForm({
      ...EMPTY_FORM,
      especie_id: firstActiveSpecies ? String(firstActiveSpecies.id) : '',
      categoria_servicio_id: serviceCategories.find((item) => toBoolean(item.activo))
        ? String(serviceCategories.find((item) => toBoolean(item.activo))?.id)
        : '',
      permisos: systemModules.map((module) => ({
        codigo: module.codigo,
        modulo_nombre: module.nombre,
        puede_ver: false,
        puede_crear: false,
        puede_editar: false,
        puede_eliminar: false,
      })),
    });
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (record: CatalogRow) => {
    setEditingRecord(record);
    setForm({
      nombre: record.nombre || '',
      especie_id: record.especie_id ? String(record.especie_id) : '',
      dias_por_unidad:
        record.dias_por_unidad === null ||
        record.dias_por_unidad === undefined
          ? ''
          : String(record.dias_por_unidad),
      meses_por_unidad:
        record.meses_por_unidad === null ||
        record.meses_por_unidad === undefined
          ? ''
          : String(record.meses_por_unidad),
      descripcion: record.descripcion || '',
      categoria_servicio_id: record.categoria_servicio_id
        ? String(record.categoria_servicio_id)
        : '',
      precio_base:
        record.precio_base === null || record.precio_base === undefined
          ? ''
          : String(record.precio_base),
      controla_inventario: toBoolean(record.controla_inventario),
      permisos: (record.permisos || []).map((permission) => ({
        ...permission,
        puede_ver: toBoolean(permission.puede_ver),
        puede_crear: toBoolean(permission.puede_crear),
        puede_editar: toBoolean(permission.puede_editar),
        puede_eliminar: toBoolean(permission.puede_eliminar),
      })),
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const saveRecord = async (
    payload: Record<string, unknown>,
    record: CatalogRow | null
  ) => {
    if (!selectedCatalog) return;
    setSaving(true);
    try {
      const url = record
        ? `${CATALOG_API_URL}/${selectedCatalog}/${record.id}`
        : `${CATALOG_API_URL}/${selectedCatalog}`;
      const response = await fetch(url, {
        method: record ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible guardar el registro');
      }

      const message = data.message || 'Registro guardado correctamente';
      setPendingConfirmation(null);
      closeForm();
      setSuccessMessage(message);
      setShowSuccessModal(true);
      await loadCatalog(selectedCatalog);
    } catch (saveError) {
      setPendingConfirmation(null);
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'No fue posible guardar el registro'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCatalog) return;
    setFormError('');

    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (catalog.requiresSpecies && !form.especie_id) {
      setFormError('Debe seleccionar una especie.');
      return;
    }
    if (catalog.requiresServiceCategory && !form.categoria_servicio_id) {
      setFormError('Debe seleccionar una categoría de servicio.');
      return;
    }

    const payload: Record<string, unknown> = {
      nombre: form.nombre.trim(),
    };
    if (catalog.requiresSpecies) payload.especie_id = Number(form.especie_id);
    if (catalog.hasDescription) payload.descripcion = form.descripcion.trim() || null;
    if (catalog.requiresServiceCategory) {
      payload.categoria_servicio_id = Number(form.categoria_servicio_id);
    }
    if (catalog.hasPrice) {
      const price = form.precio_base === '' ? null : Number(form.precio_base);
      if (price !== null && (!Number.isFinite(price) || price < 0)) {
        setFormError('El precio base no puede ser negativo.');
        return;
      }
      payload.precio_base = price;
    }
    if (catalog.hasInventoryControl) {
      payload.controla_inventario = form.controla_inventario ? 1 : 0;
    }
    if (catalog.managesPermissions) payload.permisos = form.permisos;
    if (catalog.hasIntervalValues) {
      payload.dias_por_unidad =
        form.dias_por_unidad === '' ? null : Number(form.dias_por_unidad);
      payload.meses_por_unidad =
        form.meses_por_unidad === '' ? null : Number(form.meses_por_unidad);
      const positiveConversions = [
        payload.dias_por_unidad,
        payload.meses_por_unidad,
      ].filter((value) => typeof value === 'number' && value > 0);
      if (positiveConversions.length !== 1) {
        setFormError(
          'Indique una sola conversión positiva: días por unidad o meses por unidad.'
        );
        return;
      }
    }

    if (editingRecord) {
      setPendingConfirmation({ type: 'update', record: editingRecord, payload });
      return;
    }
    await saveRecord(payload, null);
  };

  const performStatusChange = async (record: CatalogRow) => {
    if (!selectedCatalog) return;
    const isActive = toBoolean(record.activo);
    setSaving(true);
    try {
      const response = await fetch(
        `${CATALOG_API_URL}/${selectedCatalog}/${record.id}/estado`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ activo: !isActive }),
        }
      );
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible cambiar el estado');
      }

      const message = data.message || 'Estado actualizado correctamente';
      setPendingConfirmation(null);
      setSuccessMessage(message);
      setShowSuccessModal(true);
      await loadCatalog(selectedCatalog);
    } catch (statusError) {
      setPendingConfirmation(null);
      setActionError(
        statusError instanceof Error
          ? statusError.message
          : 'No fue posible cambiar el estado'
      );
    } finally {
      setSaving(false);
    }
  };

  const requestStatusChange = (record: CatalogRow) => {
    setPendingConfirmation({
      type: toBoolean(record.activo) ? 'deactivate' : 'reactivate',
      record,
    });
  };

  const toggleRolePermission = (
    moduleCode: string,
    action: PermissionAction
  ) => {
    setForm((current) => ({
      ...current,
      permisos: current.permisos.map((permission) => {
        if (permission.codigo !== moduleCode) return permission;
        const enabled = !toBoolean(permission[action]);
        if (action === 'puede_ver' && !enabled) {
          return {
            ...permission,
            puede_ver: false,
            puede_crear: false,
            puede_editar: false,
            puede_eliminar: false,
          };
        }
        return {
          ...permission,
          [action]: enabled,
          ...(action !== 'puede_ver' && enabled ? { puede_ver: true } : {}),
        };
      }),
    }));
  };

  const performDelete = async (record: CatalogRow) => {
    if (!selectedCatalog) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${CATALOG_API_URL}/${selectedCatalog}/${record.id}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible eliminar el registro');
      }

      const message = data.message || 'Registro eliminado correctamente';
      setPendingConfirmation(null);
      setSuccessMessage(message);
      setShowSuccessModal(true);
      await loadCatalog(selectedCatalog);
    } catch (deleteError) {
      setPendingConfirmation(null);
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No fue posible eliminar el registro'
      );
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (record: CatalogRow) => {
    setPendingConfirmation({
      type: catalog.hasActive ? 'deactivate' : 'delete',
      record,
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.type === 'update') {
      await saveRecord(
        pendingConfirmation.payload,
        pendingConfirmation.record
      );
      return;
    }
    if (pendingConfirmation.type === 'reactivate') {
      await performStatusChange(pendingConfirmation.record);
      return;
    }
    await performDelete(pendingConfirmation.record);
  };

  const confirmationDetails = pendingConfirmation
    ? {
        update: {
          title: `¿Actualizar ${catalog.singular}?`,
          message: `Se guardarán los cambios realizados en “${pendingConfirmation.record.nombre}”.`,
          confirmLabel: 'Sí, actualizar',
          icon: Edit3,
          tone: 'primary',
        },
        deactivate: {
          title: `¿Dar de baja ${catalog.singular}?`,
          message: `“${pendingConfirmation.record.nombre}” dejará de estar disponible en los formularios. Podrá reactivarlo después.`,
          confirmLabel: 'Sí, dar de baja',
          icon: Power,
          tone: 'destructive',
        },
        reactivate: {
          title: `¿Reactivar ${catalog.singular}?`,
          message: `“${pendingConfirmation.record.nombre}” volverá a estar disponible en los formularios correspondientes.`,
          confirmLabel: 'Sí, reactivar',
          icon: RotateCcw,
          tone: 'primary',
        },
        delete: {
          title: `¿Eliminar ${catalog.singular}?`,
          message: `“${pendingConfirmation.record.nombre}” se eliminará permanentemente. Esta acción no se puede deshacer.`,
          confirmLabel: 'Sí, eliminar',
          icon: Trash2,
          tone: 'destructive',
        },
      }[pendingConfirmation.type]
    : null;
  const ConfirmationIcon = confirmationDetails?.icon || AlertTriangle;

  if (modulePermissions === null) {
    return (
      <div className="w-full p-[0.825rem] md:p-[1.375rem] text-muted-foreground">
        Validando permisos...
      </div>
    );
  }

  if (!permissions.canView) {
    return (
      <div className="w-full p-[0.825rem] md:p-[1.375rem]">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-destructive">
          No tiene permisos para consultar los catálogos del sistema.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="mb-4 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <Settings2 className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-foreground md:text-2xl">
              Mantenimiento
            </h1>
          </div>
          <p className="text-muted-foreground">
            Seleccione el módulo y catálogo que desea administrar.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2 sm:mb-8 sm:pb-4" role="tablist">
        {CATALOG_GROUPS.filter(
          (group) => modulePermissions[group.moduleCode]?.canView
        ).map((group) => {
          const Icon = group.icon;
          const isSelected = selectedGroupKey === group.key;
          return (
            <button
              key={group.key}
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                if (group.key !== selectedGroupKey) {
                  setSelectedGroupKey(group.key);
                  setSelectedCatalog(null);
                  setRecords([]);
                  setSpecies([]);
                  setServiceCategories([]);
                  setSystemModules([]);
                }
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground hover:bg-border'
              }`}
            >
              <Icon className="h-4 w-4" />
              {group.label}
            </button>
          );
        })}
      </div>

      <div
        className={`grid grid-cols-1 transition-all sm:grid-cols-2 xl:grid-cols-4 ${
          selectedCatalog ? 'mb-3 gap-2 sm:mb-4' : 'mb-4 gap-3 sm:mb-8 sm:gap-4'
        }`}
        role="group"
        aria-label={`Catálogos de ${currentGroup.label}`}
      >
        {currentGroup.catalogs.map((item) => {
          const Icon = item.icon;
          const selected = selectedCatalog === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              aria-controls="catalog-content"
              onClick={() => selectCatalog(item.key)}
              disabled={saving}
              title={selectedCatalog ? item.description : undefined}
              className={`group flex min-w-0 rounded-2xl border text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${
                selectedCatalog ? 'flex-row items-center gap-3 p-3' : 'flex-col p-3 sm:p-5'
              } ${
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'
              }`}
            >
              <span className={`flex items-center justify-between ${selectedCatalog ? 'shrink-0 gap-1' : 'mb-2 w-full sm:mb-5'}`}>
                <span className={`flex items-center justify-center rounded-xl ${selectedCatalog ? 'h-9 w-9' : 'h-10 w-10 sm:h-12 sm:w-12'} ${selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                  <Icon className={selectedCatalog ? 'h-4 w-4' : 'h-6 w-6'} strokeWidth={1.7} aria-hidden="true" />
                </span>
                {selected
                  ? <Check className={selectedCatalog ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} aria-hidden="true" />
                  : !selectedCatalog && <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />}
              </span>
              <span className={`${selectedCatalog ? 'text-sm' : 'mb-1 text-base sm:mb-2 sm:text-lg'} min-w-0 font-semibold text-foreground`}>
                {item.label}
              </span>
              {!selectedCatalog && (
                <>
                  <span className="mb-2 flex-1 text-sm leading-relaxed text-muted-foreground sm:mb-5">{item.description}</span>
                  <span className="text-sm font-medium text-primary">{selected ? 'Catálogo seleccionado' : 'Administrar opciones'}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <section id="catalog-content" aria-label={selectedCatalog ? catalog.label : 'Opciones del catálogo'} aria-busy={Boolean(selectedCatalog && loading)}>
      {selectedCatalog ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-5 md:px-6">
            <div className="flex items-center gap-3">
              <CatalogIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">{catalog.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground" role="status">
                  {loading ? 'Cargando opciones…' : `${filteredRecords.length} ${filteredRecords.length === 1 ? 'opción disponible' : 'opciones disponibles'}`}
                </p>
              </div>
            </div>
            {permissions.canCreate && !catalog.readOnly && (
              <button
                type="button"
                onClick={openCreateForm}
                disabled={loading || Boolean(error)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Agregar {catalog.singular}
              </button>
            )}
          </div>

        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-4 sm:p-5 md:px-6">
          <div>
            <label htmlFor="catalog-search" className="mb-2 block text-sm font-medium text-foreground">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="catalog-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nombre"
                className="w-full rounded-lg border border-border bg-secondary py-2.5 pl-10 pr-4 text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="catalog-sort" className="mb-2 block text-sm font-medium text-foreground">
              Ordenar
            </label>
            <ThemedSelect
              id="catalog-sort"
              value={sortOption}
              onChange={(event) =>
                setSortOption(event.target.value as SortOption)
              }
              className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="name-asc">Nombre A-Z</option>
              <option value="name-desc">Nombre Z-A</option>
              <option value="id-asc">Más antiguos</option>
              <option value="id-desc">Más recientes</option>
            </ThemedSelect>
          </div>
        </div>

      {error && (
        <div role="alert" className="mx-5 mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-destructive md:mx-6">
          {error}
          <button type="button" onClick={() => void loadCatalog(selectedCatalog)} className="ml-3 underline underline-offset-4">Reintentar</button>
        </div>
      )}

        {!loading && !error && (
          <div className="overflow-x-auto px-5 pb-6 md:px-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-y border-border bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  {catalogHasDetail && <th className="px-4 py-3 font-medium">Detalle</th>}
                  {catalog.hasActive && <th className="px-4 py-3 font-medium">Estado</th>}
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedRecords.map((record) => {
                  const active = toBoolean(record.activo);
                  return (
                    <tr key={record.id} className="bg-card transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-3">
                          <span className="rounded-lg bg-primary/10 p-2 text-primary"><CatalogIcon className="h-4 w-4" aria-hidden="true" /></span>
                          <span className="max-w-[220px] break-words font-semibold text-foreground">{record.nombre}</span>
                        </div>
                      </td>
                      {catalogHasDetail && (
                        <td className="max-w-md px-4 py-3 align-top text-muted-foreground">
                          <div className="space-y-1">
                            {catalog.requiresSpecies && <p>{record.especie_nombre || 'Sin especie'}</p>}
                            {record.categoria_nombre && <p className="font-medium text-primary">{record.categoria_nombre}</p>}
                            {record.descripcion && <p className="line-clamp-2">{record.descripcion}</p>}
                            {catalog.hasPrice && <p>Precio base: {record.precio_base === null || record.precio_base === undefined ? 'Sin precio' : `Q ${Number(record.precio_base).toFixed(2)}`}</p>}
                            {catalog.hasInventoryControl && <p>{toBoolean(record.controla_inventario) ? 'Controla inventario' : 'No controla inventario'}</p>}
                            {catalog.managesPermissions && <p>{(record.permisos || []).filter((item) => toBoolean(item.puede_ver)).length} módulos con acceso</p>}
                          </div>
                        </td>
                      )}                      {catalog.hasActive && <td className="px-4 py-3 align-top"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{active ? 'Activo' : 'De baja'}</span></td>}
                      <td className="px-4 py-3 align-top">
                        {((permissions.canEdit && !catalog.readOnly) || (permissions.canDelete && !catalog.readOnly)) ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {permissions.canEdit && !catalog.readOnly && <button type="button" onClick={() => openEditForm(record)} aria-label={`Editar ${record.nombre}`} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Edit3 className="h-4 w-4" aria-hidden="true" />Editar</button>}
                            {catalog.hasActive && !active && permissions.canEdit && <button type="button" onClick={() => requestStatusChange(record)} aria-label={`Reactivar ${record.nombre}`} className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RotateCcw className="h-4 w-4" />Reactivar</button>}
                            {permissions.canDelete && !catalog.readOnly && (!catalog.hasActive || active) && <button type="button" onClick={() => requestDelete(record)} aria-label={`Eliminar ${record.nombre}`} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive">{catalog.hasActive ? <Power className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}{catalog.hasActive ? 'Dar de baja' : 'Eliminar'}</button>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {paginatedRecords.length === 0 && <tr><td colSpan={2 + Number(catalogHasDetail) + Number(Boolean(catalog.hasActive))} className="px-5 py-12 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" /><p className="font-medium text-foreground">{searchTerm ? 'No se encontraron coincidencias' : 'Aún no hay opciones registradas'}</p><p className="mt-2 text-sm text-muted-foreground">{searchTerm ? 'Pruebe con otro nombre o limpie la búsqueda.' : 'Las opciones que agregue aparecerán aquí.'}</p>{searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="mt-4 text-sm font-medium text-primary hover:underline">Limpiar búsqueda</button>}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {loading && (
          <div role="status" className="px-5 py-10 text-center text-muted-foreground">
            Cargando catálogo...
          </div>
        )}

        <div className="flex flex-col gap-4 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Mostrar
            <ThemedSelect
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </ThemedSelect>
            por página
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-lg border border-border bg-secondary p-2 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-24 text-center text-sm text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="rounded-lg border border-border bg-secondary p-2 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
        </p>
      )}
      </section>

      {showForm && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6 ${catalog.managesPermissions ? 'max-w-4xl' : 'max-w-lg'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              aria-label="Cerrar formulario"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="form-title" className="mb-2 text-2xl font-bold text-foreground">
              {editingRecord
                ? `Editar ${catalog.singular}`
                : `${catalog.gender === 'masculine' ? 'Nuevo' : 'Nueva'} ${catalog.singular}`}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {editingRecord
                ? 'Actualice los datos del registro a continuación.'
                : 'Complete los campos para agregar un nuevo registro.'}
            </p>

            <form onSubmit={(e) => void handleSubmit(e)}>
              {formError && (
                <div role="alert" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <label htmlFor="nombre" className="mb-1.5 block text-sm font-medium text-foreground">
                    Nombre
                  </label>
                  <input
                    id="nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(event) =>
                      setForm({ ...form, nombre: event.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary"
                    placeholder={`Ej. ${
                      catalog.key === 'razas'
                        ? 'Husky Siberiano'
                        : catalog.key === 'vacunas'
                          ? 'Múltiple'
                          : 'Consulta general'
                    }`}
                    maxLength={150}
                    disabled={saving}
                    autoFocus
                  />
                </div>

                {catalog.hasDescription && (
                  <div>
                    <label htmlFor="descripcion" className="mb-1.5 block text-sm font-medium text-foreground">
                      Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <textarea
                      id="descripcion"
                      value={form.descripcion}
                      onChange={(event) =>
                        setForm({ ...form, descripcion: event.target.value })
                      }
                      rows={3}
                      maxLength={255}
                      disabled={saving}
                      className="w-full resize-none rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                      placeholder="Descripción breve"
                    />
                  </div>
                )}

                {catalog.requiresServiceCategory && (
                  <div>
                    <label htmlFor="categoria-servicio" className="mb-1.5 block text-sm font-medium text-foreground">
                      Categoría de servicio
                    </label>
                    <ThemedSelect
                      id="categoria-servicio"
                      value={form.categoria_servicio_id}
                      onChange={(event) =>
                        setForm({ ...form, categoria_servicio_id: event.target.value })
                      }
                      disabled={saving}
                      className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                    >
                      <option value="">Seleccionar categoría</option>
                      {serviceCategories.map((category) => (
                        <option
                          key={category.id}
                          value={category.id}
                          disabled={!toBoolean(category.activo)}
                        >
                          {category.nombre} {!toBoolean(category.activo) ? '(De baja)' : ''}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>
                )}

                {catalog.hasPrice && (
                  <div>
                    <label htmlFor="precio-base" className="mb-1.5 block text-sm font-medium text-foreground">
                      Precio base <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <input
                      id="precio-base"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.precio_base}
                      onChange={(event) =>
                        setForm({ ...form, precio_base: event.target.value })
                      }
                      disabled={saving}
                      className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                      placeholder="0.00"
                    />
                  </div>
                )}

                {catalog.hasInventoryControl && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
                    <input
                      type="checkbox"
                      checked={form.controla_inventario}
                      onChange={(event) =>
                        setForm({ ...form, controla_inventario: event.target.checked })
                      }
                      disabled={saving}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Controla inventario</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Actívelo cuando el servicio descuente productos del inventario.
                      </span>
                    </span>
                  </label>
                )}

                {catalog.managesPermissions && (
                  <div>
                    <div className="mb-3">
                      <p className="font-medium text-foreground">Permisos por módulo</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Crear, editar o eliminar activa automáticamente el permiso para ver.
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-secondary text-left text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">Módulo</th>
                            <th className="px-3 py-3 text-center font-medium">Ver</th>
                            <th className="px-3 py-3 text-center font-medium">Crear</th>
                            <th className="px-3 py-3 text-center font-medium">Editar</th>
                            <th className="px-3 py-3 text-center font-medium">Eliminar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {form.permisos.map((permission) => (
                            <tr key={permission.codigo}>
                              <td className="px-4 py-3 font-medium text-foreground">
                                {permission.modulo_nombre}
                              </td>
                              {(['puede_ver', 'puede_crear', 'puede_editar', 'puede_eliminar'] as PermissionAction[]).map((action) => (
                                <td key={action} className="px-3 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={toBoolean(permission[action])}
                                    onChange={() => toggleRolePermission(permission.codigo, action)}
                                    disabled={saving}
                                    aria-label={`${action.replace('puede_', '')} en ${permission.modulo_nombre}`}
                                    className="h-4 w-4 accent-primary"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {catalog.requiresSpecies && (
                  <div>
                    <label htmlFor="especie" className="mb-1.5 block text-sm font-medium text-foreground">
                      Especie asociada
                    </label>
                    <ThemedSelect
                      id="especie"
                      value={form.especie_id}
                      onChange={(event) =>
                        setForm({ ...form, especie_id: event.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                      disabled={saving}
                    >
                      <option value="">Seleccionar especie</option>
                      {species.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={!toBoolean(s.activo)}
                        >
                          {s.nombre} {!toBoolean(s.activo) ? '(De baja)' : ''}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>
                )}

                {catalog.hasIntervalValues && (
                  <div className="rounded-xl border border-border bg-secondary/50 p-4">
                    <p className="mb-4 text-sm font-medium text-foreground">
                      Intervalo de tiempo
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="dias" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Días
                        </label>
                        <input
                          id="dias"
                          type="number"
                          min="0"
                          value={form.dias_por_unidad}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              dias_por_unidad: event.target.value,
                              meses_por_unidad: '',
                            })
                          }
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                          placeholder="Ej. 15"
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="meses" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Meses
                        </label>
                        <input
                          id="meses"
                          type="number"
                          min="0"
                          value={form.meses_por_unidad}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              meses_por_unidad: event.target.value,
                              dias_por_unidad: '',
                            })
                          }
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary disabled:opacity-50"
                          placeholder="Ej. 12"
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-w-28 items-center justify-center rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingConfirmation && confirmationDetails && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="maintenance-confirmation-title"
            aria-describedby="maintenance-confirmation-description"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="relative border-b border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 px-6 pb-5 pt-7 text-center">
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border shadow-sm ${
                  confirmationDetails.tone === 'destructive'
                    ? 'border-destructive/25 bg-destructive/10 text-destructive'
                    : 'border-primary/25 bg-primary/10 text-primary'
                }`}
              >
                <ConfirmationIcon className="h-8 w-8" strokeWidth={1.8} />
              </div>
              <h2
                id="maintenance-confirmation-title"
                className="text-xl font-bold text-foreground"
              >
                {confirmationDetails.title}
              </h2>
            </div>

            <div className="px-6 py-5">
              <p
                id="maintenance-confirmation-description"
                className="text-center text-sm leading-relaxed text-muted-foreground"
              >
                {confirmationDetails.message}
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirmation(null)}
                  disabled={saving}
                  className="rounded-xl border border-border bg-secondary px-4 py-2.5 font-medium text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmPendingAction()}
                  disabled={saving}
                  autoFocus
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                    confirmationDetails.tone === 'destructive'
                      ? 'bg-destructive hover:bg-destructive/90 focus-visible:ring-destructive'
                      : 'bg-primary hover:bg-primary/90 focus-visible:ring-primary'
                  }`}
                >
                  <ConfirmationIcon className="h-4 w-4" />
                  {saving ? 'Procesando...' : confirmationDetails.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-success-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl"
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-10 w-10 text-primary" strokeWidth={2.2} />
              </div>
            </div>
            <h2 id="maintenance-success-title" className="mb-2 text-xl font-semibold text-foreground">
              Operación realizada correctamente
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">{successMessage}</p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="maintenance-error-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl"
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-9 w-9 text-destructive" />
              </div>
            </div>
            <h2 id="maintenance-error-title" className="mb-2 text-xl font-semibold text-foreground">
              No fue posible completar la operación
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError('')}
              className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
