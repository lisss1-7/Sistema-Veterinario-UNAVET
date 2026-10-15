import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryProduct } from '../../utils/types';
import type { ModulePermissions } from '../../hooks/useModulePermissions';
import { requestJson } from '../../utils/apiClient';
import { inventoryError, inventoryMoney, inventoryToday, type Purchase, type PurchaseItem, type Supplier } from '../../utils/inventoryOperations';
import { CreateButton } from '../ModuleHeader';
import ThemedSelect from '../ThemedSelect';
import { Field, inputClass, OperationModal, OperationNotice, primaryButton, secondaryButton } from './OperationUi';

type Props = { inventory: InventoryProduct[]; permissions: ModulePermissions; onInventoryChanged: () => Promise<void> };
const emptyItem = (): PurchaseItem => ({ productId: '', quantity: 1, unitCost: 0, lotCode: '', expirationDate: '' });

export default function InventoryPurchases({ inventory, permissions, onInventoryChanged }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(inventoryToday);
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()]);
  const [requestKey, setRequestKey] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null);
  const [reason, setReason] = useState('');
  const [filters, setFilters] = useState({ supplierId: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value)).toString();
      const [purchases, suppliers] = await Promise.all([
        requestJson<Purchase[]>(`inventario/compras?${query}`, { defaultError: 'No se pudieron cargar las compras' }),
        requestJson<Supplier[]>('inventario/proveedores', { defaultError: 'No se pudieron cargar los proveedores' }),
      ]);
      setPurchases(purchases); setSuppliers(suppliers);
    } catch (error) { setError(inventoryError(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [appliedFilters]);
  const changeItem = (index: number, changes: Partial<PurchaseItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const total = items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitCost * 100), 0) / 100;

  const receive = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !permissions.canCreate) return;
    if (!supplierId || items.some((item) => !item.productId)) { setError('Seleccione proveedor y todos los productos'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestJson<{ message: string }>('inventario/compras', { method: 'POST', body: { supplierId, date, receipt, notes, requestKey, items }, defaultError: 'No se pudo registrar la recepción' });
      setOpen(false); setMessage(result.message);
      await Promise.all([load(), onInventoryChanged()]);
    } catch (error) { setError(inventoryError(error)); }
    finally { setBusy(false); }
  };
  const cancel = async (event: FormEvent) => {
    event.preventDefault();
    if (!cancelTarget || busy || !permissions.canDelete) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestJson<{ message: string }>(`inventario/compras/${cancelTarget.id}/anular`, { method: 'POST', body: { reason }, defaultError: 'No se pudo anular la compra' });
      setCancelTarget(null); setMessage(result.message);
      await Promise.all([load(), onInventoryChanged()]);
    } catch (error) { setError(inventoryError(error)); }
    finally { setBusy(false); }
  };

  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-foreground">Compras recibidas</h2>
      {permissions.canCreate && <CreateButton disabled={loading} onClick={() => { setSupplierId(''); setDate(inventoryToday()); setReceipt(''); setNotes(''); setItems([emptyItem()]); setRequestKey(crypto.randomUUID()); setError(''); setOpen(true); }}>Registrar compra</CreateButton>}
    </div>
    {!open && !cancelTarget && <OperationNotice message={error} error />}
    <OperationNotice message={message} />
    <form className="mb-4 grid items-end gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setError(''); setAppliedFilters({ ...filters }); }}>
      <Field label="Proveedor"><ThemedSelect aria-label="Filtrar proveedor" className={inputClass} value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}><option value="">Todos</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</ThemedSelect></Field>
      <Field label="Desde"><input type="date" className={inputClass} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
      <Field label="Hasta"><input type="date" min={filters.from || undefined} className={inputClass} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
      <button disabled={loading} className={secondaryButton}>Filtrar compras</button>
    </form>
    {loading && <p className="my-4 text-muted-foreground">Cargando compras...</p>}
    <div className="space-y-3">
      {purchases.map((purchase) => <article key={purchase.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-bold text-foreground">Compra #{purchase.id} · {purchase.supplierName}</h3><p className="text-sm text-muted-foreground">{purchase.date} · Comprobante: {purchase.receipt || 'Sin comprobante'} · {purchase.responsible}</p></div>
          <div className="text-right"><p className="font-bold text-primary">{inventoryMoney(purchase.total)}</p><span className={`text-sm ${purchase.canceled ? 'text-red-700' : 'text-green-700'}`}>{purchase.canceled ? 'Anulada' : 'Recibida'}</span></div>
        </div>
        {purchase.notes && <p className="mt-2 break-words text-sm text-muted-foreground">{purchase.notes}</p>}
        {purchase.canceled && <p className="mt-2 text-sm text-red-700">Motivo de anulación: {purchase.cancellationReason}</p>}
        <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-primary">Ver productos y lotes ({purchase.items.length})</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted text-foreground"><tr>{['Producto', 'Cantidad', 'Costo unitario', 'Subtotal', 'Lote', 'Vencimiento'].map((label) => <th className="px-3 py-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{purchase.items.map((item) => <tr key={item.id}><td className="px-3 py-2">{item.productName}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{inventoryMoney(item.unitCost)}</td><td className="px-3 py-2">{inventoryMoney(item.quantity * item.unitCost)}</td><td className="px-3 py-2">{item.lotCode}</td><td className="px-3 py-2">{item.expirationDate || '—'}</td></tr>)}</tbody></table></div>
        </details>
        {permissions.canDelete && !purchase.canceled && <button className={`${secondaryButton} mt-3 text-red-700`} onClick={() => { setCancelTarget(purchase); setReason(''); setError(''); }}>Anular compra</button>}
      </article>)}
    </div>
    {!loading && !purchases.length && <p className="py-8 text-center text-muted-foreground">No hay compras recibidas para estos filtros.</p>}
    {open && <OperationModal title="Registrar compra recibida" busy={busy} onClose={() => setOpen(false)}>
      <OperationNotice message={error} error />
      <form className="patient-form space-y-4" onSubmit={receive}>
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Proveedor"><ThemedSelect aria-label="Proveedor de la compra" disabled={busy} required className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Seleccionar proveedor</option>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</ThemedSelect></Field>
            <Field label="Fecha de recepción"><input type="date" required max={inventoryToday()} className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Número de comprobante (opcional)"><input maxLength={100} className={inputClass} value={receipt} onChange={(event) => setReceipt(event.target.value)} /></Field>
            <Field label="Observaciones (opcional)"><textarea maxLength={500} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          </div>
          {!suppliers.some((supplier) => supplier.active) && <p className="text-sm text-amber-800">Primero registra un proveedor activo en Proveedores.</p>}
          {items.map((item, index) => <div key={index} className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Producto {index + 1}</h3><button type="button" disabled={items.length === 1} className={secondaryButton} onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></div>
            <Field label="Producto"><ThemedSelect aria-label={`Producto ${index + 1}`} disabled={busy} required className={inputClass} value={item.productId} onChange={(event) => changeItem(index, { productId: event.target.value })}><option value="">Seleccionar producto</option>{inventory.filter((product) => product.status !== 'Inactivo').map((product) => <option key={product.id} value={product.id}>{product.name} · {product.presentation}</option>)}</ThemedSelect></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad"><input type="number" required min={1} max={2147483647} step={1} className={inputClass} value={Number.isFinite(item.quantity) ? item.quantity : ''} onChange={(event) => changeItem(index, { quantity: event.target.valueAsNumber })} /></Field>
              <Field label="Costo unitario (Q)"><input type="number" required min={0} max={99999999.99} step="0.01" className={inputClass} value={Number.isFinite(item.unitCost) ? item.unitCost : ''} onChange={(event) => changeItem(index, { unitCost: event.target.valueAsNumber })} /></Field>
              <Field label="Lote (opcional)"><input maxLength={80} className={inputClass} value={item.lotCode} onChange={(event) => changeItem(index, { lotCode: event.target.value })} /></Field>
              <Field label="Vencimiento (opcional)"><input type="date" min={date} className={inputClass} value={item.expirationDate} onChange={(event) => changeItem(index, { expirationDate: event.target.value })} /></Field>
            </div><p className="text-right text-sm font-semibold">Subtotal: {inventoryMoney(item.quantity * item.unitCost || 0)}</p>
          </div>)}
          <button type="button" disabled={items.length >= 200} className={secondaryButton} onClick={() => setItems([...items, emptyItem()])}>Agregar producto</button>
        </fieldset>
        <p className="text-lg font-bold text-primary">Total: {inventoryMoney(total || 0)}</p>
        <p className="text-sm text-muted-foreground">Guardar confirma la recepción y aumenta las existencias. Cada fila crea un lote; la compra recibida no se edita.</p>
        <div className="flex flex-wrap gap-3"><button disabled={busy || !suppliers.some((supplier) => supplier.active)} className={primaryButton}>{busy ? 'Recibiendo...' : 'Confirmar recepción'}</button><button type="button" disabled={busy} className={secondaryButton} onClick={() => setOpen(false)}>Cancelar</button></div>
      </form>
    </OperationModal>}
    {cancelTarget && <OperationModal title={`Anular compra #${cancelTarget.id}`} busy={busy} onClose={() => setCancelTarget(null)}>
      <OperationNotice message={error} error /><form className="space-y-4" onSubmit={cancel}>
        <p className="text-sm text-muted-foreground">Solo se puede anular si todas sus unidades siguen disponibles en sus lotes. El documento se conservará.</p>
        <Field label="Motivo de anulación"><textarea required maxLength={200} disabled={busy} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <button disabled={busy || !reason.trim()} className={primaryButton}>{busy ? 'Anulando...' : 'Confirmar anulación'}</button>
      </form>
    </OperationModal>}
  </section>;
}
