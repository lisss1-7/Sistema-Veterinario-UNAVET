import { apiFetch as fetch } from '../utils/apiFetch';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle,
  Clock3,
  Lock,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import type { InventoryProduct } from '../utils/types';
import ThemedSelect from './ThemedSelect';
import { CreateButton } from './ModuleHeader';
import { API_URL } from '../config/api';
import { getAuthHeaders } from '../utils/apiClient';
import { calculateSalesTotals } from '../utils/inventoryOperations';
import type { ModulePermissions } from '../hooks/useModulePermissions';

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
  canceled: boolean;
  cancellationReason: string;
  items: Array<SaleItem & { id: string; subtotal: number }>;
};

type SalesShift = {
  id: string;
  number: number;
  label: string;
  throughSaleId: string;
  closedAt: string;
  responsible: string;
  summary: {
    saleCount: number;
    total: number;
    productQuantity: number;
    payments: Array<{ code: string; name: string; amount: number }>;
  };
};

type Props = {
  inventory: InventoryProduct[];
  permissions: ModulePermissions;
  onInventoryChanged: () => Promise<void>;
};

type Notice = {
  title: string;
  message: string;
  type: 'warning' | 'error';
};

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
    <div ref={containerRef} className="relative min-w-0">
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
          className="min-w-0 w-full px-3 py-2 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <button type="button" onClick={() => setOpen((current) => !current)} className="shrink-0 p-2.5 text-primary" aria-label="Mostrar productos y servicios">
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

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatDisplayDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const money = (value: number) =>
  new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
  }).format(Number(value || 0));

export default function SalesClosing({ inventory, permissions, onInventoryChanged }: Props) {
  const [date, setDate] = useState(today());
  const dateRef = useRef(date);
  dateRef.current = date;
  const [shifts, setShifts] = useState<SalesShift[]>([]);
  const [currentShiftNumber, setCurrentShiftNumber] = useState(1);
  const [afterSaleId, setAfterSaleId] = useState('0');
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [shiftsKnown, setShiftsKnown] = useState(false);
  const [showShiftConfirm, setShowShiftConfirm] = useState(false);
  const [shiftLabel, setShiftLabel] = useState('');
  const [closingShift, setClosingShift] = useState(false);
  const [shiftSuccess, setShiftSuccess] = useState<{ number: number; total: number } | null>(null);
  const [finalizingDay, setFinalizingDay] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDayStatus, setLoadingDayStatus] = useState(false);
  const [isDayClosed, setIsDayClosed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showFinalizedSuccess, setShowFinalizedSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [canceling, setCanceling] = useState(false);
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
      if (dateRef.current === date) setSales(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar cierre de ventas:', error);
      if (dateRef.current === date) setSales([]);
    } finally {
      if (dateRef.current === date) setLoading(false);
    }
  };

  const loadDayStatus = async () => {
    try {
      setLoadingDayStatus(true);
      const response = await fetch(
        `${API_URL}/cierre-ventas/estado?fecha=${encodeURIComponent(date)}`,
        { headers: getAuthHeaders() }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (dateRef.current === date) setIsDayClosed(Boolean(data.isClosed));
    } catch (error) {
      if (dateRef.current !== date) return;
      setIsDayClosed(false);
      setNotice({
        title: 'No se pudo consultar el estado del día',
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible verificar si el día está finalizado.',
        type: 'error',
      });
    } finally {
      if (dateRef.current === date) setLoadingDayStatus(false);
    }
  };

  const loadShifts = async () => {
    setLoadingShifts(true);
    setShiftsKnown(false);
    try {
      const response = await fetch(`${API_URL}/cierre-ventas/turnos?fecha=${encodeURIComponent(date)}`, { headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudieron consultar los turnos.');
      if (dateRef.current !== date) return;
      setShifts(data.shifts);
      setCurrentShiftNumber(data.currentNumber);
      setAfterSaleId(data.afterSaleId);
      setShiftsKnown(true);
    } catch (error) {
      if (dateRef.current === date) setNotice({ title: 'No se pudieron cargar los turnos', message: error instanceof Error ? error.message : 'Intente consultar la fecha nuevamente.', type: 'error' });
    } finally {
      if (dateRef.current === date) setLoadingShifts(false);
    }
  };

  useEffect(() => {
    setIsDayClosed(false);
    setShifts([]);
    setShiftsKnown(false);
    setShowShiftConfirm(false);
    setShowFinalizeConfirm(false);
    setShiftLabel('');
    void Promise.all([loadSales(), loadDayStatus(), loadShifts()]);
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

  const totals = useMemo(() => calculateSalesTotals(sales), [sales]);

  const currentShiftTotals = useMemo(() => {
    const active = sales.filter((sale) => Number(sale.id) > Number(afterSaleId) && !sale.canceled);
    const payments = new Map<string, { code: string; name: string; amount: number }>();
    for (const sale of active) for (const payment of sale.payments) {
      const previous = payments.get(payment.code);
      payments.set(payment.code, { code: payment.code, name: payment.name, amount: (previous?.amount || 0) + Number(payment.amount) });
    }
    return {
      saleCount: active.length,
      total: active.reduce((sum, sale) => sum + Number(sale.total), 0),
      productQuantity: active.reduce((sum, sale) => sum + sale.items.reduce((quantity, item) => quantity + (item.type === 'Producto' ? Number(item.quantity) : 0), 0), 0),
      payments: [...payments.values()],
    };
  }, [sales, afterSaleId]);

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
    if (!permissions.canCreate) return;
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
      await loadDayStatus();
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
    if (!deleteTarget || !permissions.canDelete || canceling || !cancellationReason.trim()) return;
    setCanceling(true);
    try {
      const response = await fetch(
        `${API_URL}/cierre-ventas/${deleteTarget.id}/anular`,
        { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ reason: cancellationReason }) }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      await Promise.all([loadSales(), onInventoryChanged()]);
      setDeleteTarget(null);
    } catch (error) {
      await loadDayStatus();
      setNotice({
        title: 'No se pudo anular la venta',
        message:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado al anular la venta.',
        type: 'error',
      });
    } finally { setCanceling(false); }
  };

  const finalizeDay = async () => {
    if (!permissions.canEdit || finalizingDay || closingShift || !shiftsKnown) return;
    setFinalizingDay(true);
    try {
      const response = await fetch(`${API_URL}/cierre-ventas/finalizar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ date }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      setIsDayClosed(true);
      await loadShifts();
      setShowFinalizeConfirm(false);
      setShowForm(false);
      setDeleteTarget(null);
      resetForm();
      setShowFinalizedSuccess(true);
    } catch (error) {
      await loadDayStatus();
      setShowFinalizeConfirm(false);
      setNotice({
        title: 'No se pudo finalizar el día',
        message:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado al finalizar el día.',
        type: 'error',
      });
    } finally { setFinalizingDay(false); }
  };

  const finalizeShift = async () => {
    if (!permissions.canEdit || closingShift || finalizingDay || !shiftsKnown || isDayClosed) return;
    setClosingShift(true);
    try {
      const response = await fetch(`${API_URL}/cierre-ventas/turnos/finalizar`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ date, number: currentShiftNumber, label: shiftLabel.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo cerrar el turno.');
      setShowShiftConfirm(false);
      setShiftLabel('');
      await Promise.all([loadSales(), loadDayStatus(), loadShifts()]);
      setShiftSuccess({ number: data.shift.number, total: data.shift.summary.total });
    } catch (error) {
      setShowShiftConfirm(false);
      await Promise.all([loadDayStatus(), loadShifts()]);
      setNotice({ title: 'No se pudo cerrar el turno', message: error instanceof Error ? error.message : 'Intente nuevamente.', type: 'error' });
    } finally { setClosingShift(false); }
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
    <div className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
        <div className="min-w-0 xl:mr-auto">
          <h2 className="text-foreground text-xl font-semibold">Cierre de ventas</h2>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 w-full sm:w-auto">
            <label htmlFor="sales-closing-date" className="block text-foreground text-xs mb-1">Fecha del cierre</label>
            <input
              id="sales-closing-date"
              type="date"
              value={date}
              disabled={closingShift || finalizingDay}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 min-w-0 w-full px-4 py-2 bg-secondary border border-border rounded-xl text-foreground"
            />
          </div>
          {permissions.canEdit && <button type="button" onClick={() => setShowShiftConfirm(true)}
            disabled={loading || loadingDayStatus || loadingShifts || !shiftsKnown || isDayClosed || closingShift || finalizingDay}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-primary px-4 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <Clock3 className="h-4 w-4 shrink-0" />Cerrar turno
          </button>}
          {permissions.canEdit && <button
            type="button"
            onClick={() => setShowFinalizeConfirm(true)}
            disabled={loadingDayStatus || isDayClosed || !shiftsKnown || closingShift || finalizingDay}
            className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            <Lock className="w-4 h-4 shrink-0" />
            {isDayClosed ? 'Día finalizado' : 'Finalizar día'}
          </button>}
          {permissions.canCreate && <CreateButton
            onClick={() => setShowForm(true)}
            disabled={loadingDayStatus || isDayClosed || closingShift || finalizingDay}
          >
            Registrar venta
          </CreateButton>}
        </div>
      </div>

      {isDayClosed && (
        <div className="flex items-start gap-3 mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <Lock className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Día finalizado</p>
            <p className="text-sm">
              Este cierre está en modo de solo lectura. Ya no se pueden registrar ni anular ventas.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3 min-[400px]:[&>div:last-child]:col-span-2 lg:[&>div:last-child]:col-span-1">
        <SummaryCard label="Ventas registradas" value={String(totals.saleCount)} />
        <SummaryCard label="Total del día" value={money(totals.total)} />
        <SummaryCard
          label="Productos vendidos"
          value={String(totals.productQuantity)}
        />
      </div>

      <section className="mb-4 min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="Cierres de turno">
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-2 text-primary"><Clock3 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{isDayClosed ? 'Cierres de turno del día' : `Turno ${currentShiftNumber} en curso`}</h3>
            <p className="text-sm text-muted-foreground">Cerrar turno permite continuar vendiendo en el siguiente. Finalizar día cierra toda la jornada.</p>
          </div>
        </div>
        {(loading || loadingShifts) && <p role="status" className="text-sm text-muted-foreground">Actualizando resumen de turnos…</p>}
        {!isDayClosed && shiftsKnown && !loading && !loadingShifts && <>
          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryCard label="Ventas de este turno" value={String(currentShiftTotals.saleCount)} />
            <SummaryCard label="Total de este turno" value={money(currentShiftTotals.total)} />
            <SummaryCard label="Productos de este turno" value={String(currentShiftTotals.productQuantity)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {currentShiftTotals.payments.map((payment) => <span key={payment.code} className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{payment.name}: {money(payment.amount)}</span>)}
          </div>
        </>}
        <h4 className="mb-2 mt-4 text-sm font-semibold text-foreground">Turnos cerrados · {shifts.length}</h4>
        {shiftsKnown && !shifts.length && <p className="text-sm text-muted-foreground">Todavía no hay turnos cerrados para esta fecha.</p>}
        <div className="grid gap-3 xl:grid-cols-2">
          {shifts.map((shift) => <article key={shift.id} className="min-w-0 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="min-w-0 break-words font-semibold text-foreground">{shift.label}{shift.label !== `Turno ${shift.number}` ? ` · Turno ${shift.number}` : ''}</h5>
              <span className="font-semibold text-primary">{money(shift.summary.total)}</span>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">Cerrado por {shift.responsible} · {new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(new Date(shift.closedAt))}</p>
            <p className="mt-2 text-sm text-foreground">{shift.summary.saleCount} ventas · {shift.summary.productQuantity} productos</p>
            <div className="mt-2 flex flex-wrap gap-2">{shift.summary.payments.map((payment) => <span key={payment.code} className="rounded-lg bg-card px-2 py-1 text-xs text-foreground">{payment.name}: {money(payment.amount)}</span>)}</div>
          </article>)}
        </div>
        {!!shifts.length && <p className="mt-3 text-xs text-muted-foreground">Los cierres conservan el resumen del momento. Los cambios posteriores en ventas se reflejan en el total del día.</p>}
      </section>

      <div className="space-y-2 lg:hidden">
        {sales.map((sale) => (
          <article key={sale.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-semibold text-foreground">{sale.client || 'Consumidor final'}</h3>
                <p className="break-words text-sm text-muted-foreground">{description(sale)}</p>
                {sale.canceled && <p className="mt-1 text-sm text-red-700">Anulada: {sale.cancellationReason}</p>}
              </div>
              <p className="shrink-0 font-bold text-primary">{money(sale.total)}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sale.payments.filter((payment) => payment.amount > 0).map((payment) => (
                <span key={payment.id} className="rounded-lg bg-muted px-2 py-1 text-xs text-foreground">
                  {payment.name}: {money(payment.amount)}
                </span>
              ))}
            </div>
            {(sale.invoiceNit || sale.invoiceName) && (
              <p className="mt-2 break-words text-xs text-muted-foreground">
                Factura: {sale.invoiceNit || 'Sin NIT'} · {sale.invoiceName || 'Sin nombre'}
              </p>
            )}
            {permissions.canDelete && <div className="mt-2 flex justify-end">
              <button
                type="button"
                title="Anular venta"
                aria-label={`Anular venta de ${sale.client || 'Consumidor final'}`}
                onClick={() => { setCancellationReason(''); setDeleteTarget(sale); }}
                disabled={isDayClosed || sale.canceled}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-red-100 p-2 text-red-600 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>}
          </article>
        ))}
        {!loading && sales.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
            No hay ventas registradas para esta fecha.
          </p>
        )}
        <div className="rounded-xl border border-border bg-muted p-3 text-sm text-foreground">
          <p className="font-bold">Total: {money(totals.total)}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {paymentOptions.map((payment) => (
              <span key={payment.id}>{payment.nombre}: {money(totals.byMethod[payment.codigo] || 0)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden max-w-full overflow-x-auto rounded-xl border border-border bg-card shadow-lg lg:block">
        <table className="w-full table-fixed" style={{ minWidth: 830 + (permissions.canDelete ? 100 : 0) + paymentOptions.length * 110 }}>
          <thead className="bg-muted text-foreground text-sm">
            <tr>
              <th className="w-[180px] px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Descripción</th>
              {paymentOptions.map((payment) => (
                <th key={payment.id} className="w-[110px] break-words px-2 py-3 text-right text-[13px] leading-snug">
                  {payment.nombre}
                </th>
              ))}
              <th className="w-[150px] px-4 py-3 text-left">Factura NIT</th>
              <th className="w-[200px] px-4 py-3 text-left">Nombre</th>
              {permissions.canDelete && <th className="w-[100px] px-4 py-3 text-center">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-muted text-sm text-foreground">
                <td className="break-words px-4 py-3">{sale.client || 'Consumidor final'}{sale.canceled && <p className="mt-1 text-xs text-red-700">Anulada: {sale.cancellationReason}</p>}</td>
                <td className="[overflow-wrap:anywhere] px-4 py-3">{description(sale)}</td>
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
                <td className="break-words px-4 py-3">{sale.invoiceNit || '—'}</td>
                <td className="break-words px-4 py-3">{sale.invoiceName || '—'}</td>
                {permissions.canDelete && <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    title="Anular venta"
                    onClick={() => { setCancellationReason(''); setDeleteTarget(sale); }}
                    disabled={isDayClosed || sale.canceled}
                    className="p-2 bg-red-100 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed text-red-600 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>}
              </tr>
            ))}
            {!loading && sales.length === 0 && (
              <tr>
                <td colSpan={paymentOptions.length + (permissions.canDelete ? 5 : 4)} className="px-6 py-10 text-center text-muted-foreground">
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
              <td className="px-4 py-3" colSpan={permissions.canDelete ? 3 : 2}>Total: {money(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showForm && permissions.canCreate && !isDayClosed && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl min-w-0 w-full max-h-[92vh] max-h-[92dvh] overflow-y-auto p-3 sm:p-5 md:p-6">
            <div className="flex justify-between gap-4 mb-5">
              <div>
                <h3 className="text-foreground text-xl">Registrar venta</h3>
                <p className="text-muted-foreground text-sm">
                  Cierre del {formatDisplayDate(date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                aria-label="Cerrar formulario de venta"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center p-2 bg-muted rounded-lg self-start"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveSale} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Cliente" value={client} onChange={setClient} />
                <div>
                  <label className="block text-foreground mb-2 text-sm">Forma de pago</label>
                  <ThemedSelect
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
                  </ThemedSelect>
                </div>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <h4 className="text-foreground font-medium mb-3">
                  Productos y servicios
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_100px_130px_auto] gap-3 items-end">
                  <div className="min-w-0 sm:col-span-2 xl:col-span-1">
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
                  <CreateButton
                    onClick={addItem}
                    className="w-full sm:col-span-2 xl:col-span-1"
                  >
                    Agregar
                  </CreateButton>
                </div>

                <div className="space-y-2 mt-4">
                  {items.map((item, index) => (
                    <div key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 bg-card/60 rounded-lg px-3 py-2 text-sm">
                      <span className="min-w-0 break-words text-foreground">
                        {item.quantity} × {item.description} — {money(item.quantity * item.unitPrice)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label={`Quitar ${item.description}`}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-red-600 p-1"
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
                <div className="flex flex-col gap-3 w-full sm:w-auto sm:flex-row">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="min-h-11 flex-1 sm:flex-none whitespace-nowrap px-4 py-2 bg-muted text-foreground rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="min-h-11 flex-1 sm:flex-none flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2 bg-primary text-white rounded-lg"
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

      {deleteTarget && permissions.canDelete && !isDayClosed && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] max-h-[90dvh] overflow-y-auto p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">¿Anular esta venta?</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Los productos se reintegrarán una sola vez. El documento y sus pagos se conservarán como anulados y se excluirán de los totales.
            </p>
            <label className="mb-4 block text-left text-sm text-foreground">Motivo de anulación
              <textarea required maxLength={200} disabled={canceling} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-secondary px-3 py-2" />
            </label>
            <div className="flex gap-3">
              <button disabled={canceling} type="button" onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 bg-muted rounded-lg">Cancelar</button>
              <button disabled={canceling || !cancellationReason.trim()} type="button" onClick={deleteSale} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">{canceling ? 'Anulando...' : 'Anular'}</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] max-h-[90dvh] overflow-y-auto p-6 text-center">
            <CheckCircle className="w-14 h-14 text-green-700 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">Venta registrada</h3>
            <p className="text-muted-foreground text-sm mb-5">
              El cierre de ventas se actualizó correctamente. El inventario solo cambia cuando la venta incluye productos.
            </p>
            <button type="button" onClick={() => setShowSuccess(false)} className="w-full px-4 py-2 bg-primary text-white rounded-lg">Aceptar</button>
          </div>
        </div>
      )}

      {showShiftConfirm && permissions.canEdit && !isDayClosed && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="shift-confirm-title" className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <Clock3 className="mx-auto mb-3 h-12 w-12 text-primary" />
            <h3 id="shift-confirm-title" className="text-center text-xl font-semibold text-foreground">¿Cerrar el turno {currentShiftNumber}?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">Se guardará el resumen de este turno. El día seguirá abierto y las nuevas ventas pertenecerán al siguiente turno.</p>
            <div className="my-4 rounded-xl bg-muted p-3 text-center text-foreground">{currentShiftTotals.saleCount} ventas · <strong>{money(currentShiftTotals.total)}</strong></div>
            <label htmlFor="sales-shift-label" className="text-sm text-foreground">Nombre del turno (opcional)</label>
            <input id="sales-shift-label" value={shiftLabel} onChange={(event) => setShiftLabel(event.target.value)} maxLength={80} disabled={closingShift} placeholder="Ejemplo: Mañana" className="mt-1 mb-5 min-h-11 w-full rounded-xl border border-border bg-secondary px-3 text-foreground" />
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={closingShift} onClick={() => setShowShiftConfirm(false)} className="min-h-11 flex-1 rounded-xl bg-muted px-3 text-foreground disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={closingShift || loading || loadingShifts || !shiftsKnown} onClick={finalizeShift} className="min-h-11 flex-1 rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-50">{closingShift ? 'Cerrando…' : 'Sí, cerrar turno'}</button>
            </div>
          </div>
        </div>
      )}

      {shiftSuccess && <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="shift-success-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
          <CheckCircle className="mx-auto mb-3 h-12 w-12 text-primary" />
          <h3 id="shift-success-title" className="text-xl font-semibold text-foreground">Turno {shiftSuccess.number} cerrado</h3>
          <p className="my-3 text-muted-foreground">Total registrado: {money(shiftSuccess.total)}. El día sigue abierto para el siguiente turno.</p>
          <button type="button" onClick={() => setShiftSuccess(null)} className="min-h-11 w-full rounded-xl bg-primary text-primary-foreground">Continuar</button>
        </div>
      </div>}

      {showFinalizeConfirm && permissions.canEdit && !isDayClosed && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] max-h-[90dvh] overflow-y-auto p-6 text-center">
            <Lock className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">¿Finalizar el día?</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Después de finalizar el {formatDisplayDate(date)} ya no será posible registrar ni anular ventas de esa fecha.
              {' '}También se cerrará automáticamente el último turno pendiente.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={finalizingDay}
                className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={finalizeDay}
                disabled={finalizingDay || closingShift || !shiftsKnown}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                {finalizingDay ? 'Finalizando…' : 'Sí, finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFinalizedSuccess && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] max-h-[90dvh] overflow-y-auto p-6 text-center">
            <CheckCircle className="w-14 h-14 text-green-700 mx-auto mb-3" />
            <h3 className="text-foreground text-xl mb-2">Día finalizado</h3>
            <p className="text-muted-foreground text-sm mb-5">
              El cierre del {formatDisplayDate(date)} quedó bloqueado correctamente.
            </p>
            <button
              type="button"
              onClick={() => setShowFinalizedSuccess(false)}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] max-h-[90dvh] overflow-y-auto p-6 text-center">
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
  return <td className="break-words px-2 py-3 text-right tabular-nums">{value ? money(value) : '—'}</td>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-card border border-border rounded-xl p-3.5 shadow-md">
      <div className="flex items-center gap-3">
        <div className="shrink-0 p-1.5 bg-muted rounded-lg">
          <ReceiptText className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="break-words text-foreground text-lg font-semibold">{value}</p>
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
        className="min-w-0 w-full px-4 py-2 bg-secondary border border-border rounded-lg"
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
        className="min-w-0 w-full px-3 py-2 bg-secondary border border-border rounded-lg"
      />
    </div>
  );
}
