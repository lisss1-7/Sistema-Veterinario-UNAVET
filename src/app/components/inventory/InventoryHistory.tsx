import { useEffect, useState } from 'react';
import type { InventoryProduct } from '../../utils/types';
import { requestJson } from '../../utils/apiClient';
import ThemedSelect from '../ThemedSelect';
import { Field, inputClass, OperationNotice, secondaryButton } from './OperationUi';

const actions = {
  CREAR_PRODUCTO: 'Producto creado',
  EDITAR_PRODUCTO: 'Producto editado',
  INACTIVAR_PRODUCTO: 'Producto inactivado',
  Entrada: 'Entrada de existencias',
  Salida: 'Salida de existencias',
  Ajuste: 'Ajuste de existencias',
};
type HistoryItem = {
  id: string;
  productId: string;
  productName: string;
  date: string;
  action: keyof typeof actions;
  responsible: string;
  description: string;
  quantity: number | null;
  previousStock: number | null;
  newStock: number | null;
};
type Result = { items: HistoryItem[]; total: number; page: number; pageSize: number };
const dateFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'medium',
});

export default function InventoryHistory({ inventory }: { inventory: InventoryProduct[] }) {
  const [filters, setFilters] = useState({ productId: '', action: '', from: '', to: '' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void requestJson<Result>(`inventario/historial?${query}&page=${page}`, {
      defaultError: 'No se pudo cargar el historial de inventario',
    })
      .then((data) => { if (current) setResult(data); })
      .catch((error: unknown) => {
        if (current) setError(error instanceof Error ? error.message : 'No se pudo cargar el historial');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, page, refresh]);

  return <section>
    <h2 className="mb-4 text-xl font-semibold text-foreground">Historial de cambios</h2>
    <p className="mb-4 text-sm text-muted-foreground">
      Consulta quién creó o editó un producto y quién registró entradas, salidas o ajustes de existencias.
      Las altas y ediciones se registran desde la incorporación de este historial. Las fechas se muestran en hora de Guatemala.
    </p>
    <form className="mb-4 grid items-end gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => {
      event.preventDefault();
      setPage(1);
      setQuery(new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString());
      setRefresh((value) => value + 1);
    }}>
      <Field label="Producto">
        <ThemedSelect aria-label="Filtrar producto en historial" className={inputClass} value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}>
          <option value="">Todos</option>
          {inventory.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </ThemedSelect>
      </Field>
      <Field label="Acción">
        <ThemedSelect aria-label="Filtrar acción" className={inputClass} value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
          <option value="">Todas</option>
          {Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </ThemedSelect>
      </Field>
      <Field label="Desde"><input type="date" className={inputClass} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
      <Field label="Hasta"><input type="date" min={filters.from || undefined} className={inputClass} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
      <button disabled={loading} className={secondaryButton}>Consultar historial</button>
    </form>
    <OperationNotice message={error} error />
    {loading ? <p role="status" className="my-4 text-muted-foreground">Cargando historial...</p> : !error && <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-muted text-foreground"><tr>
            {['Fecha y hora', 'Producto', 'Acción', 'Responsable', 'Detalle'].map((label) => <th key={label} className="px-3 py-3 text-left">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {result.items.map((item) => <tr key={item.id} className="text-foreground hover:bg-muted/60">
              <td className="whitespace-nowrap px-3 py-3">{dateFormat.format(new Date(item.date))}</td>
              <td className="px-3 py-3 font-semibold">{item.productName}</td>
              <td className="px-3 py-3">{actions[item.action] || item.action}</td>
              <td className="px-3 py-3">{item.responsible}</td>
              <td className="max-w-sm break-words px-3 py-3">
                <p>{item.description}</p>
                {item.quantity !== null && <p className="mt-1 text-xs text-muted-foreground">
                  Cantidad: {item.quantity} · Existencias: {item.previousStock} → {item.newStock}
                </p>}
              </td>
            </tr>)}
            {!result.items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No hay cambios registrados para estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{result.total} registros · Página {page} de {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} className={secondaryButton} onClick={() => setPage(page - 1)}>Anterior</button>
          <button disabled={page * result.pageSize >= result.total} className={secondaryButton} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      </div>
    </>}
  </section>;
}
