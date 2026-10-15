import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  ListChecks,
  Package,
  RotateCcw,
  Search,
  UserRound,
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
      <div className="inventory-audit patient-form-shell rounded-[30px] border border-border/80 bg-card p-4 shadow-lg sm:p-6">
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
            <div className="patient-form-section rounded-xl border border-border bg-muted p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Productos</p>
              <p className="mt-1 text-xl font-bold text-foreground">{completedAudit.totalProducts}</p>
            </div>
            <div className="patient-form-section rounded-xl border border-border bg-muted p-4">
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
              className="patient-form-primary flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition-all duration-200"
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={onBack}
              className="patient-form-secondary min-h-[44px] rounded-xl border px-4 py-2.5 font-semibold transition-colors"
            >
              Volver al inventario
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-audit patient-form-shell rounded-[30px] border border-border/80 bg-card p-3 sm:p-5">
      <div className="patient-form space-y-3 sm:space-y-5">
      <div className="patient-form-section flex flex-col gap-4 rounded-2xl border p-4 sm:p-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Regresar al inventario
          </button>
          <div className="flex items-start gap-3">
            <div className="audit-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Control de existencias</p>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Auditoría de inventario</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Registra el conteo físico de todos los productos activos. Al finalizar, las diferencias ajustarán las existencias del sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 min-[400px]:[&>button:first-child]:col-span-2 sm:[&>button:first-child]:col-span-1">
          <button
            type="button"
            onClick={() => setConfirmationType('finalize')}
            disabled={!isComplete || !canFinalize || isFinishing}
            className="patient-form-primary flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finalizar auditoría
          </button>
          <button
            type="button"
            onClick={markWithoutDifferences}
            className="patient-form-secondary flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            Marcar sin diferencias
          </button>
          <button
            type="button"
            onClick={() => countedItems > 0 && setConfirmationType('reset')}
            disabled={countedItems === 0}
            className="patient-form-secondary flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <AuditSummary label="Periodo auditado" value={formatAuditMonth(auditDate)} icon={<ClipboardCheck className="h-5 w-5" />} />
        <AuditSummary label="Ítems contados" value={`${countedItems}/${auditProducts.length}`} icon={<Package className="h-5 w-5" />} />
        <AuditSummary label="Discrepancias" value={String(discrepancyCount)} alert={discrepancyCount > 0} icon={<AlertTriangle className="h-5 w-5" />} />
        <AuditSummary label="Auditor" value={user?.name || user?.email || 'Usuario actual'} icon={<UserRound className="h-5 w-5" />} />
      </div>

      <div className="patient-form-section rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-foreground">Avance del conteo</span>
            <span className="text-muted-foreground">{countedItems} de {auditProducts.length} productos</span>
          </div>
          <div role="progressbar" aria-label="Avance del conteo" aria-valuemin={0} aria-valuemax={auditProducts.length || 1} aria-valuenow={countedItems} className="audit-progress-track h-2 overflow-hidden rounded-full">
            <div className="audit-progress-fill h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${auditProducts.length ? (countedItems / auditProducts.length) * 100 : 0}%` }} />
          </div>
        </div>
        <label htmlFor="audit-product-search" className="mb-2 block text-sm font-medium text-foreground">Buscar en el conteo</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="audit-product-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar producto por nombre o categoría"
            className="w-full rounded-xl border border-border bg-secondary/80 py-2.5 pl-10 pr-4 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {filteredProducts.map((product) => {
          const physicalStock = physicalCounts[product.id] ?? '';
          const difference = physicalStock === ''
            ? null
            : Number(physicalStock) - Number(product.currentStock);
          const status = auditStatus(physicalStock, Number(product.currentStock));

          return (
            <article key={product.id} className="patient-form-section rounded-2xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-foreground">{product.name}</h3>
                  <p className="break-words text-sm text-muted-foreground">{product.category} · {product.presentation}</p>
                </div>
                <span className={`audit-status shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${
                  status === 'Correcto'
                    ? 'audit-status-correct'
                    : status === 'Con diferencia'
                      ? 'audit-status-difference'
                      : 'audit-status-pending'
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
                    className="mt-1 min-w-0 w-full rounded-xl border border-border bg-secondary/80 px-2 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="mt-2 w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      <div className="patient-form-section hidden overflow-hidden rounded-2xl border border-border bg-card shadow-lg xl:block">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-foreground"><ListChecks className="h-5 w-5 text-primary" />Productos y conteo físico</h3>
          <span className="text-sm text-muted-foreground">{filteredProducts.length} productos visibles</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="audit-table-heading text-sm">
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
                  <tr key={product.id} className="audit-product-row">
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
                        className="w-28 rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </td>
                    <td className={`px-4 py-3 font-semibold ${difference === 0 || difference === null ? 'text-foreground' : 'text-red-600'}`}>
                      {difference === null ? '-' : difference > 0 ? `+${difference}` : difference}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`audit-status inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                          status === 'Correcto'
                            ? 'audit-status-correct'
                            : status === 'Con diferencia'
                              ? 'audit-status-difference'
                              : 'audit-status-pending'
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
                        className="w-full min-w-48 rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          <div className="patient-form-shell relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[30px] border border-border/80 bg-card p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setConfirmationType(null)}
              disabled={isFinishing}
              className="patient-form-close absolute right-4 top-4 rounded-xl border bg-muted p-2 text-foreground transition-colors hover:bg-border disabled:opacity-50"
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
                className="patient-form-secondary min-h-[44px] flex-1 rounded-xl border px-4 py-2.5 font-semibold transition-colors disabled:opacity-50"
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
                className="patient-form-primary flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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
    <div className="patient-form-section rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 break-words text-base font-bold sm:text-lg ${alert ? 'text-red-600' : 'text-foreground'}`}>
            {value}
          </p>
        </div>
        {icon && <div className="audit-icon hidden shrink-0 rounded-xl border p-2 sm:block">{icon}</div>}
      </div>
    </div>
  );
}
