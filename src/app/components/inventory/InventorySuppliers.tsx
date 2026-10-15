import { useEffect, useState, type FormEvent } from 'react';
import type { ModulePermissions } from '../../hooks/useModulePermissions';
import { requestJson } from '../../utils/apiClient';
import { inventoryError, type Supplier } from '../../utils/inventoryOperations';
import { CreateButton } from '../ModuleHeader';
import { Field, inputClass, OperationModal, OperationNotice, primaryButton, secondaryButton } from './OperationUi';

const emptySupplier = (): Omit<Supplier, 'id'> => ({ name: '', phone: '', email: '', address: '', active: true });

export default function InventorySuppliers({ permissions }: { permissions: ModulePermissions }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptySupplier);
  const [editingId, setEditingId] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setSuppliers(await requestJson<Supplier[]>('inventario/proveedores', { defaultError: 'No se pudieron cargar los proveedores' })); }
    catch (error) { setError(inventoryError(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !(editingId ? permissions.canEdit : permissions.canCreate)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestJson<{ message: string }>(`inventario/proveedores${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST', body: form, defaultError: 'No se pudo guardar el proveedor',
      });
      setOpen(false); setMessage(result.message); await load();
    } catch (error) { setError(inventoryError(error)); }
    finally { setBusy(false); }
  };

  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-foreground">Proveedores</h2>
      {permissions.canCreate && <CreateButton onClick={() => { setEditingId(''); setForm(emptySupplier()); setError(''); setOpen(true); }}>Nuevo proveedor</CreateButton>}
    </div>
    {!open && <OperationNotice message={error} error />}
    <OperationNotice message={message} />
    <Field label="Buscar proveedor"><input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o teléfono" /></Field>
    {loading && <p className="my-4 text-muted-foreground">Cargando proveedores...</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {suppliers.filter((supplier) => `${supplier.name} ${supplier.phone}`.toLowerCase().includes(search.toLowerCase())).map((supplier) => <article key={supplier.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2"><h3 className="font-bold text-foreground">{supplier.name}</h3><span className={`rounded-full px-2 py-1 text-xs ${supplier.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{supplier.active ? 'Activo' : 'Inactivo'}</span></div>
        <p className="break-words text-sm text-muted-foreground">Teléfono: {supplier.phone || '—'}</p>
        <p className="break-words text-sm text-muted-foreground">Correo: {supplier.email || '—'}</p>
        <p className="break-words text-sm text-muted-foreground">Dirección: {supplier.address || '—'}</p>
        {permissions.canEdit && <button className={`${secondaryButton} mt-3`} onClick={() => { setEditingId(supplier.id); setForm(supplier); setError(''); setOpen(true); }}>Editar proveedor</button>}
      </article>)}
    </div>
    {!loading && suppliers.filter((supplier) => `${supplier.name} ${supplier.phone}`.toLowerCase().includes(search.toLowerCase())).length === 0 && <p className="py-8 text-center text-muted-foreground">No hay proveedores coincidentes.</p>}
    {open && <OperationModal title={editingId ? 'Editar proveedor' : 'Nuevo proveedor'} busy={busy} onClose={() => setOpen(false)}>
      <OperationNotice message={error} error />
      <form className="patient-form space-y-4" onSubmit={save}>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre"><input required maxLength={150} className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Teléfono"><input maxLength={12} pattern="[0-9]{8,12}" className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Correo"><input type="email" maxLength={150} className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Dirección"><input maxLength={255} className={inputClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Proveedor activo</label>
        </fieldset>
        <p className="text-sm text-muted-foreground">Los proveedores inactivos conservan su historial y no se pueden seleccionar en nuevas compras.</p>
        <div className="flex flex-wrap gap-3"><button disabled={busy} className={primaryButton}>{busy ? 'Guardando...' : 'Guardar proveedor'}</button><button type="button" disabled={busy} className={secondaryButton} onClick={() => setOpen(false)}>Cancelar</button></div>
      </form>
    </OperationModal>}
  </section>;
}
