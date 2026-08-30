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
  X,
} from 'lucide-react';

import type { InventoryProduct } from '../utils/types';
import SalesClosing from '../components/SalesClosing';
import ThemedSelect from '../components/ThemedSelect';

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

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [activeSection, setActiveSection] =
    useState<'inventory' | 'sales'>('inventory');

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

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            Inventario
          </h1>
        </div>

        {activeSection === 'inventory' && (
          <button
            type="button"
            onClick={() => openModal()}
            disabled={loadingCatalogs}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-[#F7EFE6] rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />

            {loadingCatalogs
              ? 'Cargando catálogos...'
              : 'Nuevo producto'}
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'inventory'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Productos y existencias
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'sales'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Cierre de ventas
        </button>
      </div>

      {activeSection === 'sales' ? (
        <SalesClosing
          inventory={inventory}
          onInventoryChanged={loadInventory}
        />
      ) : (
        <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-primary text-white rounded-xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">
                Total de productos
              </p>

              <p className="text-3xl font-bold">
                {inventory.length}
              </p>
            </div>

            <Package className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-red-500 text-white rounded-xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">
                Stock bajo
              </p>

              <p className="text-3xl font-bold">
                {lowStockProducts.length}
              </p>
            </div>

            <AlertTriangle className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-red-700 text-white rounded-xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">
                Agotados
              </p>

              <p className="text-3xl font-bold">
                {outOfStockProducts.length}
              </p>
            </div>

            <AlertTriangle className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 md:p-6 shadow-lg mb-6 border border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
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
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
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

      <div className="lg:hidden space-y-4">
        {filteredInventory.map((product) => {
          const currentStock = Number(product.currentStock || 0);
          const minimumStock = Number(product.minStock || 0);
          const isLowStock = currentStock <= minimumStock;
          const isOutOfStock = currentStock === 0;

          return (
            <article
              key={product.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/10"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {product.category}
                  </p>
                  <h3 className="text-foreground text-lg font-semibold">
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

              <div className="grid grid-cols-2 gap-3 text-sm">
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
                <button
                  type="button"
                  onClick={() => adjustStock(product.id, 1)}
                  className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-xl text-sm"
                  title="Entrada +1"
                >
                  +1
                </button>

                <button
                  type="button"
                  onClick={() => adjustStock(product.id, -1)}
                  disabled={currentStock <= 0}
                  className="px-3 py-2 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed text-red-800 rounded-xl text-sm"
                  title="Salida -1"
                >
                  -1
                </button>

                <button
                  type="button"
                  onClick={() => openModal(product)}
                  className="flex-1 px-4 py-2 bg-secondary hover:bg-border text-primary rounded-xl transition-colors"
                  title="Editar"
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => openDeleteModal(product)}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors"
                  title="Eliminar"
                >
                  Eliminar
                </button>
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

      <div className="hidden lg:block bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-primary text-[#F7EFE6]">
              <tr>
                <th className="px-6 py-3 text-left">
                  Producto
                </th>

                <th className="px-6 py-3 text-left">
                  Categoría
                </th>

                <th className="px-6 py-3 text-left">
                  Presentación
                </th>

                <th className="px-6 py-3 text-left">
                  Stock
                </th>

                <th className="px-6 py-3 text-left">
                  Stock Mín.
                </th>

                <th className="px-6 py-3 text-left">
                  Precio (Q)
                </th>

                <th className="px-6 py-3 text-left">
                  Vencimiento
                </th>

                <th className="px-6 py-3 text-left">
                  Estado
                </th>

                <th className="px-6 py-3 text-left">
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
                    className="hover:bg-muted"
                  >
                    <td className="px-6 py-4 text-foreground font-medium">
                      {product.name}
                    </td>

                    <td className="px-6 py-4 text-foreground">
                      {product.category}
                    </td>

                    <td className="px-6 py-4 text-foreground">
                      {product.presentation}
                    </td>

                    <td className="px-6 py-4">
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

                    <td className="px-6 py-4 text-foreground">
                      {product.minStock}
                    </td>

                    <td className="px-6 py-4 text-foreground">
                      {Number(product.price || 0).toFixed(2)}
                    </td>

                    <td className="px-6 py-4 text-foreground">
                      {product.expirationDate}
                    </td>

                    <td className="px-6 py-4">
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

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            adjustStock(product.id, 1)
                          }
                          className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-800 rounded text-sm"
                          title="Entrada +1"
                        >
                          +
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            adjustStock(product.id, -1)
                          }
                          disabled={currentStock <= 0}
                          className="px-2 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed text-red-800 rounded text-sm"
                          title="Salida -1"
                        >
                          -
                        </button>

                        <button
                          type="button"
                          onClick={() => openModal(product)}
                          className="p-2 bg-secondary hover:bg-border text-primary rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openDeleteModal(product)
                          }
                          className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
      </div>

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
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
              className="space-y-4"
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
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingProduct
                    ? 'Actualizar'
                    : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={closeFormModal}
                  className="w-full sm:w-auto px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
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
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
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
