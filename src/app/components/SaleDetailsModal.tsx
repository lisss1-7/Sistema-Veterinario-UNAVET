import { Eye, FileText } from 'lucide-react';
import type { SalesDocumentSale } from '../utils/salesClosingPdf';
import { formatDateForDisplay } from '../utils/dateFormat';
import { inventoryMoney } from '../utils/inventoryOperations';
import { OperationModal } from './inventory/OperationUi';

export default function SaleDetailsModal({ sale, onClose, onPdf, pdfBusy }: {
  sale: SalesDocumentSale; onClose: () => void; onPdf: () => void; pdfBusy: boolean;
}) {
  return <OperationModal title={`Detalle de venta #${sale.id}`} onClose={onClose}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" />Consulta de la venta registrada</p>
      <span className={`rounded-lg px-3 py-1 text-sm font-medium ${sale.canceled ? 'bg-red-100 text-red-800' : 'bg-primary/15 text-primary'}`}>{sale.canceled ? 'Anulada' : 'Vigente'}</span>
    </div>
    <dl className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
      {[
        ['Fecha', formatDateForDisplay(sale.date)], ['Cliente', sale.client || 'Consumidor final'],
        ['Factura NIT', sale.invoiceNit || 'No registrado'], ['Nombre para factura', sale.invoiceName || 'No registrado'],
      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm text-foreground">{value}</dd></div>)}
    </dl>
    {sale.canceled && <p className="mt-3 break-words rounded-xl border border-border bg-muted p-3 text-sm text-foreground">Motivo de anulación: {sale.cancellationReason || 'No registrado'}</p>}
    <h3 className="mb-2 mt-5 font-semibold text-foreground">Productos y servicios</h3>
    <div className="space-y-2">
      {sale.items.map((item, index) => <article key={index} className="min-w-0 rounded-xl border border-border p-3">
        <p className="text-xs text-muted-foreground">{item.type}</p>
        <p className="[overflow-wrap:anywhere] font-medium text-foreground">{item.description}</p>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Cantidad</dt><dd className="break-words text-foreground">{item.quantity}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Precio unitario</dt><dd className="break-words text-foreground">{inventoryMoney(item.unitPrice)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Subtotal</dt><dd className="break-words font-semibold text-foreground">{inventoryMoney(item.subtotal)}</dd></div>
        </dl>
      </article>)}
      {!sale.items.length && <p className="text-sm text-muted-foreground">No hay conceptos disponibles para esta venta.</p>}
    </div>
    <h3 className="mb-2 mt-5 font-semibold text-foreground">Formas de pago</h3>
    <div className="space-y-2">{sale.payments.map((payment, index) => <div key={`${payment.code}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-xl bg-muted p-3 text-sm text-foreground"><span className="min-w-0 flex-1 break-words">{payment.name}</span><span className="shrink-0 font-semibold">{inventoryMoney(payment.amount)}</span></div>)}</div>
    <p className="mt-4 flex flex-wrap justify-between gap-2 text-lg font-semibold text-foreground"><span>Importe registrado</span><span>{inventoryMoney(sale.total)}</span></p>
    {sale.canceled && <p className="mt-1 text-sm text-muted-foreground">Esta venta está excluida de los totales vigentes del día.</p>}
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button type="button" disabled={pdfBusy} onClick={onPdf} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"><FileText className="h-4 w-4" />{pdfBusy ? 'Generando PDF…' : 'Vista previa PDF'}</button>
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border bg-muted px-4 py-2 text-foreground">Cerrar</button>
    </div>
  </OperationModal>;
}
