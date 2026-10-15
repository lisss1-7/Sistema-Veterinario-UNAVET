import { useEffect, useState } from 'react';
import type { InventoryProduct } from '../../utils/types';
import { requestJson } from '../../utils/apiClient';
import { inventoryError, type InventoryMovement } from '../../utils/inventoryOperations';
import ThemedSelect from '../ThemedSelect';
import { Field, inputClass, OperationNotice, secondaryButton } from './OperationUi';

type Result = { items: InventoryMovement[]; total: number; page: number; pageSize: number };

export default function InventoryMovements({ inventory }: { inventory: InventoryProduct[] }) {
  const [filters, setFilters] = useState({ productId: '', origin: '', from: '', to: '' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    void requestJson<Result>(`inventario/movimientos?${query}&page=${page}`, { defaultError: 'No se pudieron cargar los movimientos' })
      .then((result) => { if (current) setResult(result); })
      .catch((error) => { if (current) setError(inventoryError(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, page]);

  return <section>
    <h2 className="mb-4 text-xl font-semibold text-foreground">Historial de movimientos</h2>
    <OperationNotice message={error} error />
    <form className="mb-4 grid items-end gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()); }}>
      <Field label="Producto"><ThemedSelect aria-label="Filtrar producto" className={inputClass} value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}><option value="">Todos</option>{inventory.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</ThemedSelect></Field>
      <Field label="Origen"><ThemedSelect aria-label="Filtrar origen" className={inputClass} value={filters.origin} onChange={(event) => setFilters({ ...filters, origin: event.target.value })}><option value="">Todos</option>{['Compra', 'Venta', 'Receta', 'Manual', 'Corrección', 'Grooming'].map((origin) => <option key={origin} value={origin}>{origin}</option>)}<option value="Historico">Saldo previo sin documento</option></ThemedSelect></Field>
      <Field label="Desde"><input type="date" className={inputClass} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
      <Field label="Hasta"><input type="date" min={filters.from || undefined} className={inputClass} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
      <button disabled={loading} className={secondaryButton}>Filtrar movimientos</button>
    </form>
    <p className="mb-3 text-sm text-muted-foreground">Las existencias anteriores se conservan como saldo previo. Las entradas antiguas sin compra registrada se identifican como históricas.</p>
    {loading && <p className="my-4 text-muted-foreground">Cargando movimientos...</p>}
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-muted text-foreground"><tr>{['Fecha', 'Producto / lote', 'Movimiento', 'Cantidad', 'Antes', 'Después', 'Responsable', 'Motivo', 'Documento'].map((label) => <th key={label} className="px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">
      {result.items.map((movement) => <tr key={movement.id} className="text-foreground hover:bg-muted/60"><td className="whitespace-nowrap px-3 py-3">{movement.date}</td><td className="px-3 py-3"><p className="font-semibold">{movement.productName}</p><p className="text-xs text-muted-foreground">{movement.lotCode || 'Sin lote registrado'}</p></td><td className="px-3 py-3"><span className={movement.type === 'Entrada' ? 'text-green-700' : movement.type === 'Salida' ? 'text-red-700' : 'text-primary'}>{movement.type}</span></td><td className="px-3 py-3">{movement.quantity}</td><td className="px-3 py-3">{movement.previousStock}</td><td className="px-3 py-3">{movement.newStock}</td><td className="px-3 py-3">{movement.responsible}</td><td className="max-w-xs break-words px-3 py-3">{movement.reason}</td><td className="px-3 py-3">{movement.document}</td></tr>)}
      {!loading && !result.items.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No hay movimientos para estos filtros.</td></tr>}
    </tbody></table></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{result.total} movimientos · Página {page} de {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><div className="flex gap-2"><button disabled={loading || page === 1} className={secondaryButton} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={loading || page * result.pageSize >= result.total} className={secondaryButton} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>
  </section>;
}
