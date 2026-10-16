import { jsPDF } from 'jspdf';
import { drawUnavetPdfHeader } from './pdfBranding';
import { formatDateForDisplay } from './dateFormat';
import { calculateSalesTotals } from './inventoryOperations';

export type SalesDocumentSale = {
  id: string;
  date: string;
  client: string;
  invoiceNit: string;
  invoiceName: string;
  total: number;
  canceled?: boolean;
  cancellationReason?: string;
  payments: Array<{ code: string; name: string; amount: number }>;
  items: Array<{ type: string; description: string; quantity: number; unitPrice: number; subtotal: number }>;
};

export type SalesDocumentShift = {
  number: number;
  label: string;
  closedAt: string;
  responsible: string;
  summary: { saleCount: number; total: number; productQuantity: number; payments: Array<{ name: string; amount: number }> };
};

type SalesDocument = {
  date: string;
  sales: SalesDocumentSale[];
  shifts: SalesDocumentShift[];
  isDayClosed: boolean;
  mode?: 'day' | 'sale';
  generatedAt?: Date;
};

const money = (value: number) => `Q ${Number(value || 0).toFixed(2)}`;
const time = (value: Date) => new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short',
}).format(value);

export function createSalesClosingPdf(report: SalesDocument, logo: string) {
  const doc = new jsPDF();
  const margin = 16, width = 178, bottom = 267;
  const individual = report.mode === 'sale';
  const title = individual ? `Detalle de venta #${report.sales[0]?.id || ''}` : 'Cierre de ventas';
  const generated = time(report.generatedAt || new Date());
  let y = 0;
  const font = (bold = false, size = 9) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size); doc.setTextColor('#2F2924');
  };
  const header = () => {
    drawUnavetPdfHeader(doc, logo, title);
    font(true, 15); doc.text(title, margin, 45);
    font(false, 9); doc.text(`Fecha: ${formatDateForDisplay(report.date)}`, margin, 52);
    doc.text(`Jornada: ${report.isDayClosed ? 'Finalizada' : 'Abierta - resumen al momento de generar'}`, margin, 58);
    doc.setDrawColor('#D8C1A1'); doc.line(margin, 62, margin + width, 62); y = 69;
  };
  const newPage = () => { doc.addPage(); header(); };
  const ensure = (height: number) => { if (y + height > bottom) newPage(); };
  const text = (value: string, bold = false) => {
    font(bold);
    const lines = doc.splitTextToSize(value, width) as string[];
    for (const line of lines) { ensure(5); font(bold); doc.text(line, margin, y); y += 5; }
  };
  const section = (value: string) => { ensure(19); y += 3; font(true, 11); doc.text(value, margin, y); y += 7; };
  header();
  const totals = calculateSalesTotals(report.sales);
  section(individual ? 'Resumen de la venta' : 'Resumen del día');
  text(`Ventas vigentes: ${totals.saleCount} | Anuladas: ${report.sales.filter(sale => sale.canceled).length}`);
  text(`Unidades de productos vendidas: ${totals.productQuantity}`);
  text(`Total vigente: ${money(totals.total)}`, true);
  const payments = new Map<string, { name: string; amount: number }>();
  for (const sale of report.sales.filter(sale => !sale.canceled)) {
    for (const payment of sale.payments) {
      const entry = payments.get(payment.code) || { name: payment.name, amount: 0 };
      entry.amount += Number(payment.amount); payments.set(payment.code, entry);
    }
  }
  section('Desglose de pagos vigentes');
  if (!payments.size) text('Sin pagos vigentes registrados.');
  for (const payment of payments.values()) text(`${payment.name}: ${money(payment.amount)}`);

  if (!individual) {
    section('Turnos cerrados');
    if (!report.shifts.length) text('No hay turnos cerrados para esta fecha.');
    for (const shift of report.shifts) {
      ensure(23);
      text(`Turno ${shift.number}: ${shift.label}`, true);
      text(`Responsable: ${shift.responsible || 'No registrado'} | Cierre: ${time(new Date(shift.closedAt))}`);
      text(`${shift.summary.saleCount} ventas | ${shift.summary.productQuantity} unidades | Total: ${money(shift.summary.total)}`);
      for (const payment of shift.summary.payments) text(`${payment.name}: ${money(payment.amount)}`);
      y += 2;
    }
    text('Los turnos conservan el resumen guardado al cerrarlos. El total del día refleja las ventas vigentes consultadas.');
  }

  const columns = [22, 80, 18, 28, 30];
  const tableHeader = () => {
    doc.setFillColor('#6B5039'); doc.rect(margin, y, width, 8, 'F');
    font(true, 8); doc.setTextColor('#FFFFFF');
    let x = margin;
    ['Tipo', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal'].forEach((value, index) => {
      doc.text(value, x + 2, y + 5); x += columns[index];
    });
    y += 8;
  };
  section(individual ? 'Datos y conceptos' : 'Detalle de ventas');
  if (!report.sales.length) text('No hay ventas registradas para esta fecha.');
  for (const sale of report.sales) {
    // Mantener completas las ventas cortas; las extensas se dividen por líneas.
    font(false, 9);
    const metadata = [
      `Venta #${sale.id} | ${sale.canceled ? 'ANULADA' : 'Vigente'} | Fecha: ${formatDateForDisplay(sale.date)}`,
      `Cliente: ${sale.client || 'Consumidor final'}`,
      `NIT: ${sale.invoiceNit || 'No registrado'} | Nombre para factura: ${sale.invoiceName || 'No registrado'}`,
      ...(sale.canceled ? [`Motivo de anulación: ${sale.cancellationReason || 'No registrado'}`] : []),
      ...sale.payments.map(payment => `Pago registrado: ${payment.name} - ${money(payment.amount)}`),
    ];
    const metadataHeight = metadata.reduce((height, value) => height + doc.splitTextToSize(value, width).length * 5, 0);
    font(false, 8);
    const rowHeight = sale.items.reduce((height, item) => height + Math.max(1,
      doc.splitTextToSize(item.description, columns[1] - 4).length,
      doc.splitTextToSize(item.type, columns[0] - 4).length) * 4 + 3, 0);
    const saleHeight = metadataHeight + 8 + rowHeight + 15;
    ensure(saleHeight <= bottom - 69 ? saleHeight : 35);
    text(`Venta #${sale.id} | ${sale.canceled ? 'ANULADA' : 'Vigente'} | Fecha: ${formatDateForDisplay(sale.date)}`, true);
    text(`Cliente: ${sale.client || 'Consumidor final'}`);
    text(`NIT: ${sale.invoiceNit || 'No registrado'} | Nombre para factura: ${sale.invoiceName || 'No registrado'}`);
    if (sale.canceled) text(`Motivo de anulación: ${sale.cancellationReason || 'No registrado'}`);
    for (const payment of sale.payments) text(`Pago registrado: ${payment.name} - ${money(payment.amount)}`);
    ensure(17); tableHeader();
    for (const [itemIndex, item] of sale.items.entries()) {
      font(false, 8);
      const cells = [item.type, item.description, String(item.quantity), money(item.unitPrice), money(item.subtotal)]
        .map((value, index) => doc.splitTextToSize(value, columns[index] - 4) as string[]);
      const count = Math.max(1, ...cells.map(cell => cell.length));
      let offset = 0;
      while (offset < count) {
        const reserve = itemIndex === sale.items.length - 1 ? 12 : 0;
        let available = Math.floor((bottom - y - 3 - reserve) / 4);
        if (available < 1) { newPage(); text(`Venta #${sale.id} - conceptos (continuación)`, true); tableHeader(); available = Math.floor((bottom - y - 3 - reserve) / 4); }
        const chunk = Math.min(available, count - offset), height = chunk * 4 + 3;
        doc.setFillColor('#F8F3ED'); doc.setDrawColor('#DED4C7');
        doc.rect(margin, y, width, height, 'FD'); font(false, 8);
        let x = margin;
        cells.forEach((lines, index) => {
          lines.slice(offset, offset + chunk).forEach((line, lineIndex) => doc.text(line, x + 2, y + 4 + lineIndex * 4));
          x += columns[index];
        });
        y += height; offset += chunk;
      }
    }
    y += 5; text(`Importe registrado: ${money(sale.total)}${sale.canceled ? ' - excluido del total vigente' : ''}`, true); y += 5;
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page); font(false, 7);
    doc.setDrawColor('#D8C1A1'); doc.line(margin, 279, margin + width, 279);
    doc.text(`UNAVET | Generado: ${generated}`, margin, 285);
    doc.text(`Página ${page} de ${pageCount}`, margin + width, 285, { align: 'right' });
  }
  return doc;
}
