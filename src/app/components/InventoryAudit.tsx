import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';

import type { InventoryProduct } from '../utils/types';
import { API_URL } from '../config/api';
import { getAuthHeaders } from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import { getUnavetLogoBase64 } from '../utils/pdfBranding';
import {
  createInventoryAuditPdf,
  type AuditReport,
} from '../utils/inventoryAuditPdf';

type Props = {
  products: InventoryProduct[];
  auditDate: string;
  canFinalize: boolean;
  onBack: () => void;
  onCompleted: () => Promise<void>;
};

type ConfirmationType = 'reset' | 'finalize' | null;

const normalizeText = (value?: string) =>
  value
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') || '';

const auditStatus = (physicalStock: string, systemStock: number) => {
  if (physicalStock === '') return 'Pendiente';
  return Number(physicalStock) === systemStock ? 'Correcto' : 'Con diferencia';
};

const formatAuditMonth = (value: string) =>
  new Intl.DateTimeFormat('es-GT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));

const downloadAuditPdf = async (report: AuditReport) => {
  const logoBase64 = await getUnavetLogoBase64();
  const doc = createInventoryAuditPdf(report, logoBase64);
  doc.save(`auditoria-inventario-${report.code}.pdf`);
};

export default function InventoryAudit({
  products,
  auditDate,
  canFinalize,
  onBack,
  onCompleted,
}: Props) {
  const { user } = useAuth();
  const [startedAt] = useState(() => new Date().toISOString());
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [completedAudit, setCompletedAudit] = useState<AuditReport | null>(null);
  const [confirmationType, setConfirmationType] =
    useState<ConfirmationType>(null);

  const auditProducts = useMemo(
    () => products.filter((product) => normalizeText(product.status) !== 'inactivo'),
    [products]
  );
  const filteredProducts = auditProducts.filter((product) =>
    `${product.name} ${product.category}`
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase())
  );
  const countedItems = auditProducts.filter(
    (product) => physicalCounts[product.id] !== undefined && physicalCounts[product.id] !== ''
  ).length;
  const discrepancyCount = auditProducts.filter((product) => {
    const count = physicalCounts[product.id];
    return count !== undefined && count !== '' && Number(count) !== Number(product.currentStock);
  }).length;
  const isComplete = auditProducts.length > 0 && countedItems === auditProducts.length;

  const updatePhysicalCount = (productId: string, value: string) => {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) < 0)) return;
    setPhysicalCounts((current) => ({ ...current, [productId]: value }));
  };

  const markWithoutDifferences = () => {
    setPhysicalCounts((current) => {
      const next = { ...current };
      auditProducts.forEach((product) => {
        if (next[product.id] === undefined || next[product.id] === '') {
          next[product.id] = String(product.currentStock);
        }
      });
      return next;
    });
  };

  const resetCount = () => {
    setPhysicalCounts({});
    setNotes({});
    setErrorMessage('');
    setConfirmationType(null);
  };

  const finalizeAudit = async () => {
    if (!isComplete || isFinishing || !canFinalize) return;

    try {
      setIsFinishing(true);
      setErrorMessage('');
      const response = await fetch(`${API_URL}/inventario/auditorias/finalizar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          auditDate,
          startedAt,
          items: auditProducts.map((product) => ({
            productId: product.id,
            systemStock: Number(product.currentStock),
            physicalStock: Number(physicalCounts[product.id]),
            notes: notes[product.id] || '',
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No se pudo finalizar la auditoría');
      }

      const report = data.audit as AuditReport;
      setCompletedAudit(report);
      await onCompleted();

      try {
        await downloadAuditPdf(report);
      } catch (pdfError) {
        console.error('Error al generar el PDF de auditoría:', pdfError);
        setErrorMessage(
          'La auditoría finalizó correctamente, pero no se pudo descargar el PDF. Puedes intentarlo nuevamente con el botón de descarga.'
        );
      }
    } catch (error) {
      console.error('Error al finalizar auditoría:', error);
      setConfirmationType(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo finalizar la auditoría de inventario.'
      );
    } finally {
      setIsFinishing(false);
    }
  };

  if (completedAudit) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-700" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Auditoría finalizada</h2>
          <p className="mt-2 text-muted-foreground">
            La sesión <span className="font-semibold text-foreground">{completedAudit.code}</span>{' '}
            del mes de <span className="font-semibold text-foreground">{formatAuditMonth(completedAudit.auditDate)}</span>{' '}
            quedó registrada y el inventario fue conciliado con el conteo físico.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Productos</p>
              <p className="mt-1 text-xl font-bold text-foreground">{completedAudit.totalProducts}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Diferencias</p>
              <p className="mt-1 text-xl font-bold text-foreground">{completedAudit.discrepancies}</p>
            </div>
          </div>
          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>
          )}
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void downloadAuditPdf(completedAudit)}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-[#F7EFE6] transition-colors hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border"
            >
              Volver al inventario
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Regresar al inventario
          </button>
          <h2 className="text-xl font-bold text-foreground">
            Auditoría de inventario - {formatAuditMonth(auditDate)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra el conteo físico de todos los productos activos. Al finalizar, las diferencias ajustarán las existencias del sistema.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:w-[560px] [&>button:first-child]:col-span-2 sm:[&>button:first-child]:col-span-1">
          <button
            type="button"
            onClick={() => setConfirmationType('finalize')}
            disabled={!isComplete || !canFinalize || isFinishing}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-[#F7EFE6] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finalizar auditoría
          </button>
          <button
            type="button"
            onClick={markWithoutDifferences}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            Marcar sin diferencias
          </button>
          <button
            type="button"
            onClick={() => countedItems > 0 && setConfirmationType('reset')}
            disabled={countedItems === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar conteo
          </button>
        </div>
      </div>

      {!canFinalize && (
        <div className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Puedes consultar el conteo, pero necesitas permiso de edición para finalizar y ajustar existencias.
        </div>
      )}
      {errorMessage && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <AuditSummary label="Periodo auditado" value={formatAuditMonth(auditDate)} icon={<ClipboardCheck className="h-5 w-5" />} />
        <AuditSummary label="Ítems contados" value={`${countedItems}/${auditProducts.length}`} />
        <AuditSummary label="Discrepancias" value={String(discrepancyCount)} alert={discrepancyCount > 0} />
        <AuditSummary label="Auditor" value={user?.name || user?.email || 'Usuario actual'} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar producto por nombre o categoría"
            className="w-full rounded-lg border border-border bg-secondary py-2 pl-10 pr-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {filteredProducts.map((product) => {
          const physicalStock = physicalCounts[product.id] ?? '';
          const difference = physicalStock === ''
            ? null
            : Number(physicalStock) - Number(product.currentStock);
          const status = auditStatus(physicalStock, Number(product.currentStock));

          return (
            <article key={product.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">{product.category} · {product.presentation}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                  status === 'Correcto'
                    ? 'bg-green-100 text-green-800'
                    : status === 'Con diferencia'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-800'
                }`}>{status}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Sistema</p>
                  <p className="font-semibold text-foreground">{product.currentStock}</p>
                </div>
                <div>
                  <label htmlFor={`audit-count-${product.id}`} className="text-muted-foreground">Conteo físico</label>
                  <input
                    id={`audit-count-${product.id}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={physicalStock}
                    onChange={(event) => updatePhysicalCount(product.id, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <p className="text-muted-foreground">Diferencia</p>
                  <p className={`font-semibold ${difference === 0 || difference === null ? 'text-foreground' : 'text-red-600'}`}>
                    {difference === null ? '-' : difference > 0 ? `+${difference}` : difference}
                  </p>
                </div>
              </div>
              <input
                type="text"
                maxLength={500}
                value={notes[product.id] || ''}
                onChange={(event) => setNotes((current) => ({ ...current, [product.id]: event.target.value }))}
                placeholder="Observaciones"
                aria-label={`Notas de ${product.name}`}
                className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </article>
          );
        })}
        {filteredProducts.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
            No se encontraron productos para el conteo.
          </p>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-lg md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-primary text-[#F7EFE6]">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-left">Stock del sistema</th>
                <th className="px-4 py-3 text-left">Conteo físico</th>
                <th className="px-4 py-3 text-left">Diferencia</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.map((product) => {
                const physicalStock = physicalCounts[product.id] ?? '';
                const difference =
                  physicalStock === ''
                    ? null
                    : Number(physicalStock) - Number(product.currentStock);
                const status = auditStatus(physicalStock, Number(product.currentStock));

                return (
                  <tr key={product.id} className="hover:bg-muted/60">
                    <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                    <td className="px-4 py-3 text-foreground">{product.category}</td>
                    <td className="px-4 py-3 text-foreground">{product.presentation}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{product.currentStock}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={physicalStock}
                        onChange={(event) => updatePhysicalCount(product.id, event.target.value)}
                        aria-label={`Conteo físico de ${product.name}`}
                        className="w-28 rounded-lg border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className={`px-4 py-3 font-semibold ${difference === 0 || difference === null ? 'text-foreground' : 'text-red-600'}`}>
                      {difference === null ? '-' : difference > 0 ? `+${difference}` : difference}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          status === 'Correcto'
                            ? 'bg-green-100 text-green-800'
                            : status === 'Con diferencia'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        maxLength={500}
                        value={notes[product.id] || ''}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [product.id]: event.target.value,
                          }))
                        }
                        placeholder="Observaciones"
                        aria-label={`Notas de ${product.name}`}
                        className="w-full min-w-48 rounded-lg border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                    No se encontraron productos para el conteo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmationType && (
        <div className="modal-backdrop fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setConfirmationType(null)}
              disabled={isFinishing}
              className="absolute right-4 top-4 rounded-lg bg-muted p-2 text-foreground transition-colors hover:bg-border disabled:opacity-50"
              aria-label="Cerrar confirmación"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                confirmationType === 'reset'
                  ? 'bg-yellow-100 text-yellow-700'
                  : discrepancyCount > 0
                    ? 'bg-red-100 text-red-600'
                    : 'bg-green-100 text-green-700'
              }`}
            >
              {confirmationType === 'reset' ? (
                <RotateCcw className="h-9 w-9" />
              ) : discrepancyCount > 0 ? (
                <AlertTriangle className="h-9 w-9" />
              ) : (
                <CheckCircle2 className="h-9 w-9" />
              )}
            </div>

            <h3 className="text-xl font-bold text-foreground">
              {confirmationType === 'reset'
                ? '¿Reiniciar el conteo físico?'
                : discrepancyCount > 0
                  ? '¿Finalizar auditoría con diferencias?'
                  : '¿Finalizar auditoría?'}
            </h3>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {confirmationType === 'reset'
                ? 'Se borrarán todos los conteos físicos y las notas ingresadas en esta auditoría.'
                : discrepancyCount > 0
                  ? `Se encontraron ${discrepancyCount} producto(s) con diferencia. Las existencias del sistema se ajustarán al conteo físico registrado.`
                  : 'Todos los productos coinciden con el sistema. La auditoría quedará finalizada y se generará el PDF.'}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirmationType(null)}
                disabled={isFinishing}
                className="flex-1 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={
                  confirmationType === 'reset'
                    ? resetCount
                    : () => void finalizeAudit()
                }
                disabled={isFinishing}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  confirmationType === 'reset'
                    ? 'bg-yellow-600 hover:bg-yellow-700 dark:bg-[#755112] dark:hover:bg-[#8a6018]'
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {isFinishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : confirmationType === 'reset' ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {confirmationType === 'reset'
                  ? 'Sí, reiniciar'
                  : 'Sí, finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditSummary({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 break-words text-base font-bold sm:truncate sm:text-lg ${alert ? 'text-red-600' : 'text-foreground'}`}>
            {value}
          </p>
        </div>
        {icon && <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>}
      </div>
    </div>
  );
}
