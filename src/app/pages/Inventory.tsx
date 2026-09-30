import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  Search,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  Package,
  CheckCircle,
  CalendarDays,
  ClipboardCheck,
  X,
} from 'lucide-react';

import type { InventoryProduct } from '../utils/types';
import SalesClosing from '../components/SalesClosing';
import InventoryAudit from '../components/InventoryAudit';
import ThemedSelect from '../components/ThemedSelect';
import { useModulePermissions } from '../hooks/useModulePermissions';
import InformationCard from '../components/InformationCard';
import { API_URL } from '../config/api';
import { getAuthHeaders } from '../utils/apiClient';

type DeleteTarget = {
  id: string;
  name: string;
};

type CatalogItem = {
  id?: number;
  categoria_id?: number;
  estado_producto_id?: number;
  unidad_medida_id?: number;
  sin_existencias?: number;
  nombre: string;
  descripcion?: string;
  activo?: number;
};

const getCurrentGuatemalaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatAuditMonth = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return new Intl.DateTimeFormat('es-GT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
};

export default function Inventory() {
  const { permissions } = useModulePermissions('inventory');
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [activeSection, setActiveSection] =
    useState<'inventory' | 'sales' | 'audit'>('inventory');
  const [showAuditDateModal, setShowAuditDateModal] = useState(false);
  const [auditDate, setAuditDate] = useState(getCurrentGuatemalaDate);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [showModal, setShowModal] = useState(false);

  const [editingProduct, setEditingProduct] =
    useState<InventoryProduct | null>(null);

  const [formData, setFormData] =
    useState<Partial<InventoryProduct>>({});

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showDeleteSuccessModal, setShowDeleteSuccessModal] =
    useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<DeleteTarget | null>(null);

  const [showStockModal, setShowStockModal] = useState(false);
  const [stockMessage, setStockMessage] = useState('');

  const mapCatalogNames = (items: CatalogItem[]) => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item) => item.nombre)
      .filter(
        (nombre): nombre is string =>
          typeof nombre === 'string' && nombre.trim().length > 0
      );
  };

  const loadInventory = async () => {
    try {
      const response = await fetch(`${API_URL}/inventario`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Error al cargar inventario'
        );
      }

      setInventory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar inventario:', error);
      setInventory([]);
    }
  };

  const fetchCatalog = async (endpoint: string) => {
    const response = await fetch(
      `${API_URL}/catalogos/${endpoint}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || `Error al cargar catálogo ${endpoint}`
      );
    }

    return Array.isArray(data) ? (data as CatalogItem[]) : [];
  };

  const loadCatalogs = async () => {
    try {
      setLoadingCatalogs(true);

      const [categories, statuses, units] = await Promise.all([
        fetchCatalog('categorias-inventario'),
        fetchCatalog('estados-producto'),
        fetchCatalog('unidades-medida'),
      ]);

      setCategoryOptions(mapCatalogNames(categories));
      setStatusOptions(
        mapCatalogNames(
          statuses.filter((status) => !status.sin_existencias)
        )
      );
      setUnitOptions(mapCatalogNames(units));
    } catch (error) {
      console.error(
        'Error al cargar catálogos de inventario:',
        error
      );

      setCategoryOptions([]);
      setStatusOptions([]);
      setUnitOptions([]);
    } finally {
      setLoadingCatalogs(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadInventory(),
        loadCatalogs(),
      ]);
    };

    void loadInitialData();
  }, []);

  const normalizeText = (value?: string) =>
    value
      ?.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') || '';

  const isActiveStatus = (status?: string) =>
    normalizeText(status) === 'activo';

  const filteredInventory = inventory.filter((product) => {
    const productName = product.name || '';

    const matchesSearch = productName
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const matchesCategory =
      !filterCategory ||
      product.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = inventory.filter(
    (product) =>
      Number(product.currentStock || 0) <=
      Number(product.minStock || 0)
  );

  const outOfStockProducts = inventory.filter(
    (product) => Number(product.currentStock || 0) === 0
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!formData.category) {
      alert('Selecciona una categoría.');
      return;
    }

    if (!formData.status) {
      alert('Selecciona un estado.');
      return;
    }

    try {
      const url = editingProduct
        ? `${API_URL}/inventario/${editingProduct.id}`
        : `${API_URL}/inventario`;

      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Error al guardar producto'
        );
      }

      await loadInventory();

      setSuccessMessage(
        editingProduct
          ? 'Producto actualizado correctamente'
          : 'Producto creado correctamente'
      );

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar producto:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el producto.'
      );
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowModal(false);
    setEditingProduct(null);
    setFormData({});
  };

  const openDeleteModal = (product: InventoryProduct) => {
    setDeleteTarget({
      id: product.id,
      name: product.name,
    });

    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/inventario/${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Error al eliminar producto'
        );
      }

      await loadInventory();

      setShowDeleteModal(false);
      setDeleteTarget(null);
      setShowDeleteSuccessModal(true);
    } catch (error) {
      console.error('Error al eliminar producto:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar el producto.'
      );
    }
  };

  const closeDeleteSuccessModal = () => {
    setShowDeleteSuccessModal(false);
  };

  const adjustStock = async (
    id: string,
    adjustment: number
  ) => {
    try {
      const product = inventory.find(
        (item) => item.id === id
      );

      const response = await fetch(
        `${API_URL}/inventario/${id}/stock`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            adjustment,
            reason:
              adjustment > 0
                ? 'Entrada manual desde inventario'
                : 'Salida manual desde inventario',
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Error al actualizar stock'
        );
      }

      await loadInventory();

      setStockMessage(
        adjustment > 0
          ? `Se agregó 1 unidad al stock de ${
              product?.name || 'producto'
            }.`
          : `Se descontó 1 unidad del stock de ${
              product?.name || 'producto'
            }.`
      );

      setShowStockModal(true);
    } catch (error) {
      console.error('Error al ajustar stock:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el stock.'
      );
    }
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setStockMessage('');
  };

  const openModal = (product?: InventoryProduct) => {
    if (product) {
      setEditingProduct(product);
      setFormData(product);
    } else {
      setEditingProduct(null);

      setFormData({
        category: '',
        status: statusOptions[0] || '',
      });
    }

    setShowModal(true);
  };

  const closeFormModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setFormData({});
  };

  const openAuditDateModal = () => {
    setAuditDate(getCurrentGuatemalaDate());
    setShowAuditDateModal(true);
  };

  const startAudit = () => {
    if (!auditDate) return;
    setShowAuditDateModal(false);
    setActiveSection('audit');
  };

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold text-foreground md:text-2xl">
            Inventario
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Consulta productos, existencias y movimientos de la clínica.
          </p>
        </div>

        {activeSection === 'inventory' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={openAuditDateModal}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-card px-4 py-2.5 text-base font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10"
            >
              <ClipboardCheck className="w-4 h-4" />
              Auditoría
            </button>

            {permissions.canCreate && (
              <button
                type="button"
                onClick={() => openModal()}
                disabled={loadingCatalogs}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-[#F7EFE6] shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />

                {loadingCatalogs
                  ? 'Cargando catálogos...'
                  : 'Nuevo producto'}
              </button>
            )}
          </div>
        )}
      </div>

      {activeSection !== 'audit' && <div className="mb-3 flex w-full gap-1 rounded-xl border border-border bg-card p-1 shadow-sm sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:gap-2 sm:px-4 ${
            activeSection === 'inventory'
              ? 'bg-primary text-[#F7EFE6]'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Package className="h-4 w-4" />
          Productos y existencias
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:gap-2 sm:px-4 ${
            activeSection === 'sales'
              ? 'bg-primary text-[#F7EFE6]'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Cierre de ventas
        </button>
      </div>}

      {activeSection === 'audit' ? (
        <InventoryAudit
          products={inventory}
          auditDate={auditDate}
          canFinalize={permissions.canEdit}
          onBack={() => setActiveSection('inventory')}
          onCompleted={loadInventory}
        />
      ) : activeSection === 'sales' ? (
        <SalesClosing
          inventory={inventory}
          onInventoryChanged={loadInventory}
        />
      ) : (
        <>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 [&>article:last-child]:col-span-2 md:[&>article:last-child]:col-span-1">
        <InformationCard
          label="Total de productos"
          value={inventory.length}
          icon={<Package className="h-6 w-6" />}
          tone="primary"
          compact
        />
        <InformationCard
          label="Stock bajo"
          value={lowStockProducts.length}
          icon={<AlertTriangle className="h-6 w-6" />}
          tone="accent"
          compact
        />
        <InformationCard
          label="Agotados"
          value={outOfStockProducts.length}
          icon={<AlertTriangle className="h-6 w-6" />}
          tone="destructive"
          compact
        />
      </div>

      <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-foreground mb-2 text-sm">
              Buscar
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Buscar producto"
                className="w-full rounded-xl border border-border bg-secondary/80 py-2.5 pl-10 pr-4 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Categoría
            </label>

            <ThemedSelect
              value={filterCategory}
              onChange={(event) =>
                setFilterCategory(event.target.value)
              }
              className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todas</option>

              {categoryOptions.map((category) => (
                <option
                  key={category}
                  value={category}
                >
                  {category}
                </option>
              ))}
            </ThemedSelect>
          </div>
        </div>
      </div>

      <div className="space-y-2 lg:hidden">
        {filteredInventory.map((product) => {
          const currentStock = Number(product.currentStock || 0);
          const minimumStock = Number(product.minStock || 0);
          const isLowStock = currentStock <= minimumStock;
          const isOutOfStock = currentStock === 0;

          return (
            <article
              key={product.id}
              className="rounded-2xl border border-border/70 bg-card p-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {product.category}
                  </p>
                  <h3 className="text-foreground text-lg font-bold">
                    {product.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{product.presentation}</p>
                </div>

                <span
                  className={`px-3 py-2 rounded-full text-xs ${
                    isActiveStatus(product.status)
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {product.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Stock</p>
                  <p
                    className={`font-medium ${
                      isOutOfStock
                        ? 'text-red-600'
                        : isLowStock
                        ? 'text-yellow-700'
                        : 'text-foreground'
                    }`}
                  >
                    {product.currentStock}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stock mín.</p>
                  <p className="text-foreground font-medium">{product.minStock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Precio</p>
                  <p className="text-foreground font-medium">
                    Q{Number(product.price || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Vencimiento</p>
                  <p className="text-foreground font-medium">{product.expirationDate}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {permissions.canEdit && <button
                  type="button"
                  onClick={() => adjustStock(product.id, 1)}
                  className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-xl text-sm"
                  title="Entrada +1"
                >
                  +1
                </button>}

                {permissions.canEdit && <button
                  type="button"
                  onClick={() => adjustStock(product.id, -1)}
                  disabled={currentStock <= 0}
                  className="px-3 py-2 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed text-red-800 rounded-xl text-sm"
                  title="Salida -1"
                >
                  -1
                </button>}

                {permissions.canEdit && <button
                  type="button"
                  onClick={() => openModal(product)}
                  className="flex-1 px-4 py-2 bg-secondary hover:bg-border text-primary rounded-xl transition-colors"
                  title="Editar"
                >
                  Editar
                </button>}

                {permissions.canDelete && <button
                  type="button"
                  onClick={() => openDeleteModal(product)}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors"
                  title="Eliminar"
                >
                  Eliminar
                </button>}
              </div>
            </article>
          );
        })}

        {filteredInventory.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            No hay productos registrados.
          </div>
        )}
      </div>

      <section className="hidden overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-[0_12px_28px_rgba(15,23,42,0.06)] lg:block">
        <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-muted/60 via-card to-muted/50 px-4 py-2">
          <div className="rounded-lg bg-primary p-2 text-[#F7EFE6] shadow-lg shadow-primary/20">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Productos y existencias <span className="font-normal text-muted-foreground">· {filteredInventory.length} resultados</span></h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-primary text-[#F7EFE6]">
              <tr>
                <th className="px-4 py-2 text-left">
                  Producto
                </th>

                <th className="px-4 py-2 text-left">
                  Categoría
                </th>

                <th className="px-4 py-2 text-left">
                  Presentación
                </th>

                <th className="px-4 py-2 text-left">
                  Stock
                </th>

                <th className="px-4 py-2 text-left">
                  Stock Mín.
                </th>

                <th className="px-4 py-2 text-left">
                  Precio (Q)
                </th>

                <th className="px-4 py-2 text-left">
                  Vencimiento
                </th>

                <th className="px-4 py-2 text-left">
                  Estado
                </th>

                <th className="px-4 py-2 text-left">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filteredInventory.map((product) => {
                const currentStock = Number(
                  product.currentStock || 0
                );

                const minimumStock = Number(
                  product.minStock || 0
                );

                const isLowStock =
                  currentStock <= minimumStock;

                const isOutOfStock = currentStock === 0;

                return (
                  <tr
                    key={product.id}
                    className="transition-colors hover:bg-muted/60"
                  >
                    <td className="px-4 py-2 text-foreground font-medium">
                      {product.name}
                    </td>

                    <td className="px-4 py-2 text-foreground">
                      {product.category}
                    </td>

                    <td className="px-4 py-2 text-foreground">
                      {product.presentation}
                    </td>

                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            isOutOfStock
                              ? 'text-red-600 font-bold'
                              : isLowStock
                                ? 'text-yellow-600 font-bold'
                                : 'text-foreground'
                          }
                        >
                          {product.currentStock}
                        </span>

                        {isLowStock && (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-2 text-foreground">
                      {product.minStock}
                    </td>

                    <td className="px-4 py-2 text-foreground">
                      {Number(product.price || 0).toFixed(2)}
                    </td>

                    <td className="px-4 py-2 text-foreground">
                      {product.expirationDate}
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm ${
                          isActiveStatus(product.status)
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>

                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {permissions.canEdit && <button
                          type="button"
                          onClick={() =>
                            adjustStock(product.id, 1)
                          }
                          className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-800 rounded text-sm"
                          title="Entrada +1"
                        >
                          +
                        </button>}

                        {permissions.canEdit && <button
                          type="button"
                          onClick={() =>
                            adjustStock(product.id, -1)
                          }
                          disabled={currentStock <= 0}
                          className="px-2 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed text-red-800 rounded text-sm"
                          title="Salida -1"
                        >
                          -
                        </button>}

                        {permissions.canEdit && <button
                          type="button"
                          onClick={() => openModal(product)}
                          className="rounded-lg bg-secondary p-1.5 text-primary transition-colors hover:bg-border"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>}

                        {permissions.canDelete && <button
                          type="button"
                          onClick={() =>
                            openDeleteModal(product)
                          }
                          className="rounded-lg bg-red-100 p-1.5 text-red-600 transition-colors hover:bg-red-200"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredInventory.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No hay productos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="patient-form-shell max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-border/80 bg-card p-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)] md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background/60 p-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Inventario</p>
                <h2 className="text-xl font-black tracking-tight text-foreground md:text-2xl">
                  {editingProduct
                    ? 'Editar producto'
                    : 'Nuevo producto'}
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
                  Completa la información del producto de
                  inventario.
                </p>
              </div>

              <button
                type="button"
                onClick={closeFormModal}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="patient-form space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="Nombre del producto"
                  value={formData.name || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      name: value,
                    })
                  }
                  required
                />

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Categoría
                  </label>

                  <ThemedSelect
                    value={formData.category || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        category: event.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">
                      Seleccionar categoría
                    </option>

                    {categoryOptions.map((category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>
                    ))}
                  </ThemedSelect>
                </div>

                <div className="md:col-span-2">
                  <FormInput
                    label="Descripción"
                    value={formData.description || ''}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        description: value,
                      })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Unidad de medida
                  </label>
                  <ThemedSelect
                    value={formData.presentation || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        presentation: event.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar unidad</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </ThemedSelect>
                </div>

                <FormInput
                  label="Stock actual"
                  type="number"
                  min="0"
                  value={formData.currentStock ?? ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      currentStock:
                        value === ''
                          ? 0
                          : Number.parseInt(value, 10),
                    })
                  }
                  required
                />

                <FormInput
                  label="Stock mínimo"
                  type="number"
                  min="0"
                  value={formData.minStock ?? ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      minStock:
                        value === ''
                          ? 0
                          : Number.parseInt(value, 10),
                    })
                  }
                  required
                />

                <FormInput
                  label="Precio (Q)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price ?? ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      price:
                        value === ''
                          ? 0
                          : Number.parseFloat(value),
                    })
                  }
                  required
                />

                <FormInput
                  label="Fecha de vencimiento"
                  type="date"
                  value={formData.expirationDate || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      expirationDate: value,
                    })
                  }
                  required
                />

                <FormInput
                  label="Proveedor"
                  value={formData.supplier || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      supplier: value,
                    })
                  }
                  required
                />

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Estado administrativo
                  </label>

                  <ThemedSelect
                    value={formData.status || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        status:
                          event.target
                            .value as InventoryProduct['status'],
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">
                      Seleccionar estado
                    </option>

                    {statusOptions.map((status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    ))}
                  </ThemedSelect>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-[#F7EFE6] shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:brightness-110 sm:w-auto"
                >
                  {editingProduct
                    ? 'Actualizar'
                    : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={closeFormModal}
                  className="w-full rounded-xl bg-muted px-4 py-2.5 font-semibold text-foreground transition-colors hover:bg-border sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[60]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue guardada exitosamente en el
              módulo de inventario.
            </p>

            <button
              type="button"
              onClick={closeSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={closeDeleteModal}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
            </div>

            <h3 className="text-foreground text-xl text-center mb-2">
              ¿Estás seguro de eliminar este producto?
            </h3>

            <p className="text-muted-foreground text-sm text-center mb-6">
              Se eliminará el producto{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.name}
              </span>
              . Esta acción no se puede deshacer.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Sí, eliminar
              </button>

              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[80]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Producto eliminado correctamente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              El producto fue eliminado exitosamente del
              inventario.
            </p>

            <button
              type="button"
              onClick={closeDeleteSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}

      {showStockModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[90]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Stock actualizado
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              {stockMessage}
            </p>

            <button
              type="button"
              onClick={closeStockModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}
        </>
      )}

      {showAuditDateModal && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Fecha de auditoría</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Selecciona la fecha a la que corresponde el conteo físico.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditDateModal(false)}
                className="rounded-lg bg-muted p-2 text-foreground transition-colors hover:bg-border"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-2 block text-sm font-medium text-foreground">
              Fecha del conteo
            </label>
            <input
              type="date"
              value={auditDate}
              max={getCurrentGuatemalaDate()}
              onChange={(event) => setAuditDate(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <p className="mt-5 rounded-xl bg-muted p-4 text-center text-foreground">
              ¿Quiere realizar la auditoría del mes de{' '}
              <span className="font-bold">{formatAuditMonth(auditDate)}</span>?
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startAudit}
                disabled={!auditDate}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-[#F7EFE6] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sí, iniciar auditoría
              </button>
              <button
                type="button"
                onClick={() => setShowAuditDateModal(false)}
                className="flex-1 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  step,
  min,
  required = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <input
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        required={required}
      />
    </div>
  );
}

function ModalCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
      {children}
    </div>
  );
}
