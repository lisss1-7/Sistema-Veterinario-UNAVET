import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronLeft,
  ChevronRight,
  Database,
  Edit3,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import ThemedSelect from '../components/ThemedSelect';

type CatalogKey =
  | 'especies'
  | 'razas'
  | 'sexos'
  | 'estados-reproductivos'
  | 'tipos-consulta'
  | 'vacunas'
  | 'pruebas-laboratorio'
  | 'tipos-tratamiento'
  | 'estados-tratamiento'
  | 'estados-examen-fisico'
  | 'unidades-intervalo';

type CatalogDefinition = {
  key: CatalogKey;
  label: string;
  singular: string;
  hasActive?: boolean;
  requiresSpecies?: boolean;
  hasIntervalValues?: boolean;
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
};

type SortOption = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

const API_URL = '/api';
const CATALOG_API_URL = `${API_URL}/catalogos/proceso-pacientes`;

const CATALOGS: readonly CatalogDefinition[] = [
  {
    key: 'especies',
    label: 'Especies',
    singular: 'especie',
    hasActive: true,
  },
  {
    key: 'razas',
    label: 'Razas',
    singular: 'raza',
    hasActive: true,
    requiresSpecies: true,
  },
  { key: 'sexos', label: 'Sexos', singular: 'sexo' },
  {
    key: 'estados-reproductivos',
    label: 'Estados reproductivos',
    singular: 'estado reproductivo',
  },
  {
    key: 'tipos-consulta',
    label: 'Tipos de consulta',
    singular: 'tipo de consulta',
  },
  { key: 'vacunas', label: 'Vacunas', singular: 'vacuna' },
  {
    key: 'pruebas-laboratorio',
    label: 'Pruebas de laboratorio',
    singular: 'prueba de laboratorio',
  },
  {
    key: 'tipos-tratamiento',
    label: 'Tipos de tratamiento',
    singular: 'tipo de tratamiento',
  },
  {
    key: 'estados-tratamiento',
    label: 'Estados de tratamiento',
    singular: 'estado de tratamiento',
  },
  {
    key: 'estados-examen-fisico',
    label: 'Estados de examen físico',
    singular: 'estado de examen físico',
  },
  {
    key: 'unidades-intervalo',
    label: 'Unidades de intervalo',
    singular: 'unidad de intervalo',
    hasIntervalValues: true,
  },
] as const;

const EMPTY_FORM: FormState = {
  nombre: '',
  especie_id: '',
  dias_por_unidad: '',
  meses_por_unidad: '',
};

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
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
  const [selectedCatalog, setSelectedCatalog] =
    useState<CatalogKey>('especies');
  const [records, setRecords] = useState<CatalogRow[]>([]);
  const [species, setSpecies] = useState<CatalogRow[]>([]);
  const [permissions, setPermissions] =
    useState<PatientPermissions | null>(null);
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

  const catalog =
    CATALOGS.find((item) => item.key === selectedCatalog) || CATALOGS[0];

  const loadPermissions = async () => {
    try {
      const response = await fetch(`${API_URL}/catalogos/mis-modulos`, {
        headers: getAuthHeaders(),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible validar los permisos');
      }

      const patientModule = Array.isArray(data)
        ? data.find((module) => module.codigo === 'patients')
        : null;
      setPermissions({
        canView: Boolean(patientModule?.puede_ver),
        canCreate: Boolean(patientModule?.puede_crear),
        canEdit: Boolean(patientModule?.puede_editar),
        canDelete: Boolean(patientModule?.puede_eliminar),
      });
    } catch (permissionError) {
      setPermissions({
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      });
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : 'No fue posible validar los permisos'
      );
    }
  };

  const loadCatalog = async (key: CatalogKey) => {
    setLoading(true);
    setError('');
    try {
      const requests: Promise<Response>[] = [
        fetch(`${CATALOG_API_URL}/${key}`, { headers: getAuthHeaders() }),
      ];
      if (key === 'razas') {
        requests.push(
          fetch(`${CATALOG_API_URL}/especies`, { headers: getAuthHeaders() })
        );
      }

      const responses = await Promise.all(requests);
      const data = await parseResponse(responses[0]);
      if (!responses[0].ok) {
        throw new Error(data.message || 'No fue posible cargar el catálogo');
      }
      setRecords(Array.isArray(data) ? data : []);

      if (key === 'razas') {
        const speciesData = await parseResponse(responses[1]);
        if (!responses[1].ok) {
          throw new Error(
            speciesData.message || 'No fue posible cargar las especies'
          );
        }
        setSpecies(Array.isArray(speciesData) ? speciesData : []);
      }
    } catch (loadError) {
      setRecords([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar el catálogo'
      );
    } finally {
      setLoading(false);
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

    if (permissions?.canView) {
      void loadCatalog(selectedCatalog);
    } else if (permissions) {
      setLoading(false);
    }
  }, [selectedCatalog, permissions?.canView]);

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('es');
    const filtered = records.filter((record) => {
      if (!term) return true;
      return [record.nombre, record.especie_nombre]
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (catalog.requiresSpecies && !form.especie_id) {
      setFormError('Debe seleccionar una especie.');
      return;
    }

    const payload: Record<string, string | number | null> = {
      nombre: form.nombre.trim(),
    };
    if (catalog.requiresSpecies) {
      payload.especie_id = Number(form.especie_id);
    }
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

    setSaving(true);
    try {
      const url = editingRecord
        ? `${CATALOG_API_URL}/${selectedCatalog}/${editingRecord.id}`
        : `${CATALOG_API_URL}/${selectedCatalog}`;
      const response = await fetch(url, {
        method: editingRecord ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible guardar el registro');
      }

      toast.success(data.message || 'Registro guardado correctamente');
      closeForm();
      await loadCatalog(selectedCatalog);
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'No fue posible guardar el registro'
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (record: CatalogRow) => {
    const isActive = toBoolean(record.activo);
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

      toast.success(data.message || 'Estado actualizado correctamente');
      await loadCatalog(selectedCatalog);
    } catch (statusError) {
      toast.error(
        statusError instanceof Error
          ? statusError.message
          : 'No fue posible cambiar el estado'
      );
    }
  };

  const deleteRecord = async (record: CatalogRow) => {
    const confirmed = window.confirm(
      `¿Desea eliminar ${catalog.singular} “${record.nombre}”? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(
        `${CATALOG_API_URL}/${selectedCatalog}/${record.id}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'No fue posible eliminar el registro');
      }

      toast.success(data.message || 'Registro eliminado correctamente');
      await loadCatalog(selectedCatalog);
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : 'No fue posible eliminar el registro'
      );
    }
  };

  if (permissions === null) {
    return (
      <div className="p-4 text-muted-foreground md:p-8">
        Validando permisos...
      </div>
    );
  }

  if (!permissions.canView) {
    return (
      <div className="p-4 md:p-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-destructive">
          No tiene permisos para consultar los catálogos del proceso de
          pacientes.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              Catálogos del proceso
            </h1>
          </div>
          <p className="text-muted-foreground">
            Mantenimiento de las tablas dependientes de pacientes y expediente.
          </p>
        </div>

        {permissions.canCreate && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nuevo registro
          </button>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-lg md:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Catálogo
            </label>
            <ThemedSelect
              value={selectedCatalog}
              onChange={(event) =>
                setSelectedCatalog(event.target.value as CatalogKey)
              }
              className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              {CATALOGS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </ThemedSelect>
          </div>

          <div className="lg:col-span-5">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nombre"
                className="w-full rounded-lg border border-border bg-secondary py-2.5 pl-10 pr-4 text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Ordenar
            </label>
            <ThemedSelect
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
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">{catalog.label}</h2>
            <p className="text-sm text-muted-foreground">
              {filteredRecords.length} registro
              {filteredRecords.length === 1 ? '' : 's'} encontrado
              {filteredRecords.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {sortOption === 'name-desc' ? (
              <ArrowUpAZ className="h-4 w-4" />
            ) : (
              <ArrowDownAZ className="h-4 w-4" />
            )}
            Página {safePage} de {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-primary text-white">
              <tr>
                <th className="px-5 py-3 text-left">ID</th>
                <th className="px-5 py-3 text-left">Nombre</th>
                {catalog.requiresSpecies && (
                  <th className="px-5 py-3 text-left">Especie</th>
                )}
                {catalog.hasIntervalValues && (
                  <th className="px-5 py-3 text-left">Conversión</th>
                )}
                {catalog.hasActive && (
                  <th className="px-5 py-3 text-left">Estado</th>
                )}
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedRecords.map((record) => {
                const active = toBoolean(record.activo);
                return (
                  <tr key={record.id} className="hover:bg-muted/70">
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {record.id}
                    </td>
                    <td className="px-5 py-4 font-medium text-foreground">
                      {record.nombre}
                    </td>
                    {catalog.requiresSpecies && (
                      <td className="px-5 py-4 text-foreground">
                        {record.especie_nombre || 'Sin especie'}
                      </td>
                    )}
                    {catalog.hasIntervalValues && (
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        <span className="block">
                          Días: {record.dias_por_unidad ?? 'N/A'}
                        </span>
                        <span className="block">
                          Meses: {record.meses_por_unidad ?? 'N/A'}
                        </span>
                      </td>
                    )}
                    {catalog.hasActive && (
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            active
                              ? 'border border-primary/20 bg-primary/10 text-primary'
                              : 'border border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {active ? 'Activo' : 'De baja'}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {permissions.canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditForm(record)}
                            title="Editar"
                            className="rounded-lg bg-secondary p-2 text-primary transition-colors hover:bg-border"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}

                        {catalog.hasActive && permissions.canEdit && (
                          <button
                            type="button"
                            onClick={() => void changeStatus(record)}
                            title={active ? 'Dar de baja' : 'Reactivar'}
                            className={`rounded-lg p-2 transition-colors ${
                              active
                                ? 'bg-accent/10 text-foreground hover:bg-accent/20'
                                : 'bg-primary/10 text-primary hover:bg-primary/20'
                            }`}
                          >
                            {active ? (
                              <Power className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {!catalog.hasActive && permissions.canDelete && (
                          <button
                            type="button"
                            onClick={() => void deleteRecord(record)}
                            title="Eliminar"
                            className="rounded-lg bg-destructive/10 p-2 text-destructive transition-colors hover:bg-destructive/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && paginatedRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No hay registros para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="border-t border-border px-5 py-10 text-center text-muted-foreground">
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

      {showForm && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {editingRecord ? 'Editar' : 'Crear'} {catalog.singular}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Catálogo: {catalog.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar formulario"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {catalog.requiresSpecies && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Especie <span className="text-destructive">*</span>
                  </label>
                  <ThemedSelect
                    value={form.especie_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        especie_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Seleccione una especie</option>
                    {species.map((item) => {
                      const active = toBoolean(item.activo);
                      const isCurrent = String(item.id) === form.especie_id;
                      return (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={!active && !isCurrent}
                        >
                          {item.nombre}{active ? '' : ' (de baja)'}
                        </option>
                      );
                    })}
                  </ThemedSelect>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Nombre <span className="text-destructive">*</span>
                </label>
                <input
                  autoFocus={!catalog.requiresSpecies}
                  value={form.nombre}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nombre: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
                  placeholder={`Nombre de ${catalog.singular}`}
                />
              </div>

              {catalog.hasIntervalValues && (
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Complete solo una conversión. El sistema la usa para
                    calcular automáticamente la próxima dosis.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Días por unidad
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.dias_por_unidad}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          dias_por_unidad: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Meses por unidad
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.meses_por_unidad}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          meses_por_unidad: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  </div>
                </div>
              )}

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg bg-secondary px-4 py-2.5 font-medium text-foreground hover:bg-border disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2.5 font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
