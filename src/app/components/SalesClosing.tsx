import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import type { InventoryProduct } from '../utils/types';

type SaleItem = {
  type: 'Producto' | 'Servicio';
  productId?: string;
  serviceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Sale = {
  id: string;
  date: string;
  client: string;
  payments: Array<{
    id: string;
    code: string;
    name: string;
    amount: number;
  }>;
  invoiceNit: string;
  invoiceName: string;
  total: number;
  items: Array<SaleItem & { id: string; subtotal: number }>;
};

type Props = {
  inventory: InventoryProduct[];
  onInventoryChanged: () => Promise<void>;
};

type Notice = {
  title: string;
  message: string;
  type: 'warning' | 'error';
};

const API_URL = '/api';

type ServiceOption = {
  id: string;
  nombre: string;
  categoria: string;
  precio_base: number | null;
};

type SaleItemSelectorProps = {
  services: ServiceOption[];
  products: InventoryProduct[];
  value: string;
  onChange: (value: string) => void;
};

const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function SaleItemSelector({ services, products, value, onChange }: SaleItemSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = useMemo(() => {
    if (value.startsWith('service:')) {
      return services.find((item) => item.id === value.slice(8))?.nombre || '';
    }
    if (value.startsWith('product:')) {
      return products.find((item) => item.id === value.slice(8))?.name || '';
    }
    return '';
  }, [value, services, products]);

  useEffect(() => setQuery(selectedLabel), [selectedLabel]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const search = normalizeSearch(query === selectedLabel ? '' : query);
  const filteredServices = services.filter((service) =>
    normalizeSearch(`${service.nombre} ${service.categoria}`).includes(search)
  );
  const filteredProducts = products.filter((product) =>
    normalizeSearch(`${product.name} ${product.category || ''}`).includes(search)
  );

  const selectItem = (itemValue: string, label: string) => {
    onChange(itemValue);
    setQuery(label);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center bg-secondary border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary">
        <Search className="w-4 h-4 ml-3 text-primary shrink-0" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) onChange('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && open && filteredServices.length + filteredProducts.length === 1) {
              event.preventDefault();
              const service = filteredServices[0];
              const product = filteredProducts[0];
              if (service) selectItem(`service:${service.id}`, service.nombre);
              if (product) selectItem(`product:${product.id}`, product.name);
            }
          }}
          placeholder="Escribe para buscar o selecciona"
          className="w-full px-3 py-2 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <button type="button" onClick={() => setOpen((current) => !current)} className="p-2.5 text-primary" aria-label="Mostrar productos y servicios">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute z-[70] mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
          <p className="sticky top-0 px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicios</p>
          {filteredServices.map((service) => (
            <button key={service.id} type="button" onClick={() => selectItem(`service:${service.id}`, service.nombre)} className="w-full px-4 py-2 text-left hover:bg-secondary">
              <span className="block text-sm font-medium text-foreground">{service.nombre}</span>
              <span className="block text-xs text-muted-foreground">{service.categoria || 'Servicio'}{service.precio_base !== null ? ` · ${money(service.precio_base)}` : ''}</span>
            </button>
          ))}
          {filteredServices.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">Sin servicios coincidentes.</p>}

          <p className="sticky top-0 px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos de inventario</p>
          {filteredProducts.map((product) => (
            <button key={product.id} type="button" onClick={() => selectItem(`product:${product.id}`, product.name)} className="w-full px-4 py-2 text-left hover:bg-secondary">
              <span className="block text-sm font-medium text-foreground">{product.name}</span>
              <span className="block text-xs text-muted-foreground">Stock {product.currentStock} · {money(Number(product.price || 0))}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">Sin productos coincidentes.</p>}
        </div>
      )}
    </div>
  );
}

const normalizeService = (service: Record<string, unknown>): ServiceOption => ({
  id: String(service.id ?? ''),
  nombre: String(service.nombre ?? ''),
  categoria: String(service.categoria ?? ''),
  precio_base:
    service.precio_base === null || service.precio_base === undefined
      ? null
      : Number(service.precio_base),
});

type PaymentOption = {
  id: string;
  codigo: string;
  nombre: string;
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${
    localStorage.getItem('unavet_token') ||
    localStorage.getItem('token') ||
    ''
  }`,
});

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
  }).format(Number(value || 0));

export default function SalesClosing({ inventory, onInventoryChanged }: Props) {
  const [date, setDate] = useState(today());
  const [sales, setSales] = useState<Sale[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [client, setClient] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [invoiceNit, setInvoiceNit] = useState('');
  const [invoiceName, setInvoiceName] = useState('');
  const [items, setItems] = useState<SaleItem[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  const availableProducts = inventory.filter(
    (product) => Number(product.currentStock) > 0
  );

  const loadSales = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/cierre-ventas?fecha=${encodeURIComponent(date)}`,
        { headers: getAuthHeaders() }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setSales(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar cierre de ventas:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSales();
  }, [date]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [servicesResponse, paymentsResponse] = await Promise.all([
          fetch(`${API_URL}/catalogos/servicios`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_URL}/catalogos/formas-pago`, {
            headers: getAuthHeaders(),
          }),
        ]);
        const servicesData = await servicesResponse.json();
        const paymentsData = await paymentsResponse.json();
        if (!servicesResponse.ok) throw new Error(servicesData.message);
        if (!paymentsResponse.ok) throw new Error(paymentsData.message);
        setServices(
          Array.isArray(servicesData)
            ? servicesData.map(normalizeService).filter((service) => service.id)
            : []
        );
        const options = Array.isArray(paymentsData) ? paymentsData : [];
        setPaymentOptions(options);
        setPaymentMethod((current) => current || options[0]?.codigo || '');
      } catch (error) {
        setNotice({
          title: 'No se pudieron cargar los catálogos',
          message:
            error instanceof Error
              ? error.message
              : 'No fue posible cargar servicios y formas de pago.',
          type: 'error',
        });
      }
    };
    void loadOptions();
  }, []);

  const totals = useMemo(
    () =>
      sales.reduce(
        (result, sale) => {
          sale.payments.forEach((payment) => {
            result.byMethod[payment.code] =
              (result.byMethod[payment.code] || 0) + payment.amount;
          });
          result.total += sale.total;
          return result;
        },
        { byMethod: {} as Record<string, number>, total: 0 }
      ),
    [sales]
  );

  const saleTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const resetForm = () => {
    setClient('');
    setPaymentMethod(paymentOptions[0]?.codigo || '');
    setInvoiceNit('');
    setInvoiceName('');
    setItems([]);
    setSelectedItem('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleSelection = (value: string) => {
    setSelectedItem(value);
    if (value.startsWith('product:')) {
      const product = inventory.find(
        (item) => item.id === value.replace('product:', '')
      );
      setUnitPrice(Number(product?.price || 0));
    } else if (value.startsWith('service:')) {
      const serviceId = value.replace('service:', '');
      const service = services.find(
        (item) => String(item.id) === serviceId
      );
      setUnitPrice(Number(service?.precio_base || 0));
    }
  };

  const addItem = () => {
    if (!selectedItem || quantity <= 0 || unitPrice < 0) {
      setNotice({
        title: 'Información incompleta',
        message:
          'Selecciona un producto o servicio e ingresa una cantidad y un precio válidos.',
        type: 'warning',
      });
      return;
    }

    if (selectedItem.startsWith('product:')) {
      const productId = selectedItem.replace('product:', '');
      const product = inventory.find((item) => item.id === productId);
      if (!product) return;

      const alreadyAdded = items
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (alreadyAdded + quantity > Number(product.currentStock)) {
        setNotice({
          title: 'Stock insuficiente',
          message: `Solo hay ${product.currentStock} unidades disponibles de ${product.name}.`,
          type: 'warning',
        });
        return;
      }

      setItems([
        ...items,
        {
          type: 'Producto',
          productId,
          description: product.name,
          quantity,
          unitPrice,
        },
      ]);
    } else if (selectedItem.startsWith('service:')) {
      const serviceId = selectedItem.replace('service:', '');
      const service = services.find((item) => String(item.id) === serviceId);
      if (!service) {
        setNotice({
          title: 'Servicio no disponible',
          message:
            'El servicio seleccionado ya no está disponible. Actualiza la página e inténtalo nuevamente.',
          type: 'warning',
        });
        return;
      }
      setItems([
        ...items,
        {
          type: 'Servicio',
          serviceId,
          description: service.nombre,
          quantity,
          unitPrice,
        },
      ]);
    } else {
      setNotice({
        title: 'Selección no válida',
        message: 'Selecciona nuevamente un producto o servicio.',
        type: 'warning',
      });
      return;
    }

    setSelectedItem('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const saveSale = async (event: FormEvent) => {
    event.preventDefault();
    if (items.length === 0) {
      setNotice({
        title: 'Agrega una descripción',
        message:
          'Debes agregar al menos un producto o servicio antes de guardar la venta.',
        type: 'warning',
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cierre-ventas`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date,
          client,
          paymentMethod,
          invoiceNit,
          invoiceName,
          items,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      await loadSales();
      if (items.some((item) => item.type === 'Producto')) {
        await onInventoryChanged();
      }
      setShowForm(false);
      resetForm();
      setShowSuccess(true);
    } catch (error) {
      setNotice({
        title: 'No se pudo registrar la venta',
        message:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado al guardar la venta.',
        type: 'error',
      });
    }
  };

  const deleteSale = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(
        `${API_URL}/cierre-ventas/${deleteTarget.id}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      await Promise.all([loadSales(), onInventoryChanged()]);
      setDeleteTarget(null);
    } catch (error) {
      setNotice({
        title: 'No se pudo eliminar la venta',
        message:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado al eliminar la venta.',
        type: 'error',
      });
    }
  };

  const description = (sale: Sale) =>
    sale.items
      .map((item) =>
        item.quantity === 1
          ? item.description
          : `${item.quantity} × ${item.description}`
      )
      .join(', ');

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
        <div>
          <h2 className="text-foreground text-xl">Cierre de ventas</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <label className="block text-foreground text-xs mb-1">Fecha del cierre</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="px-4 py-2 bg-secondary border border-border rounded-lg text-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Registrar venta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Ventas registradas" value={String(sales.length)} />
        <SummaryCard label="Total del día" value={money(totals.total)} />
        <SummaryCard
          label="Productos vendidos"
          value={String(
            sales.flatMap((sale) => sale.items)
              .filter((item) => item.type === 'Producto')
              .reduce((sum, item) => sum + item.quantity, 0)
          )}
        />
      </div>

      <div className="overflow-x-auto bg-card border border-border rounded-xl shadow-lg">
        <table className="w-full min-w-[1250px]">
          <thead className="bg-muted text-foreground text-sm">
            <tr>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left min-w-[300px]">Descripción</th>
              {paymentOptions.map((payment) => (
                <th key={payment.id} className="px-4 py-3 text-right">
                  {payment.nombre}
                </th>
              ))}
              <th className="px-4 py-3 text-left">Factura NIT</th>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-muted text-sm text-foreground">
                <td className="px-4 py-3">{sale.client || 'Consumidor final'}</td>
                <td className="px-4 py-3">{description(sale)}</td>
                {paymentOptions.map((payment) => (
                  <PaymentCell
                    key={payment.id}
                    value={
                      sale.payments.find(
                        (item) => item.code === payment.codigo
                      )?.amount || 0
                    }
                  />
                ))}
                <td className="px-4 py-3">{sale.invoiceNit || '—'}</td>
                <td className="px-4 py-3">{sale.invoiceName || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    title="Eliminar venta"
                    onClick={() => setDeleteTarget(sale)}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && sales.length === 0 && (
              <tr>
                <td colSpan={paymentOptions.length + 5} className="px-6 py-10 text-center text-muted-foreground">
                  No hay ventas registradas para esta fecha.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-muted text-foreground font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={2}>Totales</td>
              {paymentOptions.map((payment) => (
                <PaymentCell
                  key={payment.id}
                  value={totals.byMethod[payment.codigo] || 0}
                />
              ))}
              <td className="px-4 py-3" colSpan={3}>Total: {money(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showForm && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-5 md:p-6">
            <div className="flex justify-between gap-4 mb-5">
              <div>
                <h3 className="text-foreground text-xl">Registrar venta</h3>
                <p className="text-muted-foreground text-sm">Cierre del {date}</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="p-2 bg-muted rounded-lg self-start"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveSale} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Cliente" value={client} onChange={setClient} />
                <div>
                  <label className="block text-foreground mb-2 text-sm">Forma de pago</label>
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg"
                    required
                  >
                    {paymentOptions.map((payment) => (
                      <option key={payment.id} value={payment.codigo}>
                        {payment.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <h4 className="text-foreground font-medium mb-3">
                  Productos y servicios
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_130px_auto] gap-3 items-end">
                  <div>
                    <label className="block text-foreground mb-2 text-sm">Descripción</label>
                    <SaleItemSelector
                      services={services}
                      products={availableProducts}
                      value={selectedItem}
                      onChange={handleSelection}
                    />
                  </div>
                  <NumberField label="Cantidad" value={quantity} onChange={setQuantity} min={1} />
                  <NumberField label="Precio (Q)" value={unitPrice} onChange={setUnitPrice} min={0} />
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 bg-muted-foreground text-white rounded-lg"
                  >
                    Agregar
                  </button>
                </div>

                <div className="space-y-2 mt-4">
                  {items.map((item, index) => (
                    <div key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 bg-white/50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-foreground">
                        {item.quantity} × {item.description} — {money(item.quantity * item.unitPrice)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
                        className="text-red-600 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-muted-foreground text-sm">Aún no se han agregado detalles.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Factura NIT, opcional" value={invoiceNit} onChange={setInvoiceNit} />
                <Field label="Nombre para factura, opcional" value={invoiceName} onChange={setInvoiceName} />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <p className="text-foreground text-lg font-semibold">
                  Total: {money(saleTotal)}
                </p>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Guardar venta
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">¿Eliminar esta venta?</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Los productos de esta venta serán reintegrados al inventario.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 bg-muted rounded-lg">Cancelar</button>
              <button type="button" onClick={deleteSale} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <CheckCircle className="w-14 h-14 text-green-700 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">Venta registrada</h3>
            <p className="text-muted-foreground text-sm mb-5">
              El cierre de ventas se actualizó correctamente. El inventario solo cambia cuando la venta incluye productos.
            </p>
            <button type="button" onClick={() => setShowSuccess(false)} className="w-full px-4 py-2 bg-primary text-white rounded-lg">Aceptar</button>
          </div>
        </div>
      )}

      {notice && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                notice.type === 'error' ? 'bg-red-100' : 'bg-amber-100'
              }`}
            >
              <AlertTriangle
                className={`w-10 h-10 ${
                  notice.type === 'error'
                    ? 'text-red-600'
                    : 'text-amber-600'
                }`}
              />
            </div>
            <h3 className="text-foreground text-xl mb-2">
              {notice.title}
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              {notice.message}
            </p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentCell({ value }: { value: number }) {
  return <td className="px-4 py-3 text-right">{value ? money(value) : '—'}</td>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 shadow-md">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-muted rounded-lg">
          <ReceiptText className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-foreground text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">{label}</label>
      <input
        type="number"
        min={min}
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg"
      />
    </div>
  );
}


