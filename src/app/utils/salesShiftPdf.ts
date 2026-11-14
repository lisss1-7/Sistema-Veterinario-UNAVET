import { jsPDF } from 'jspdf';
import { drawUnavetPdfHeader } from './pdfBranding';
import { formatDateForDisplay } from './dateFormat';
import type { SalesDocumentShift } from './salesClosingPdf';

export type SavedSalesShift = SalesDocumentShift & {
  id: string;
  afterSaleId: string;
  throughSaleId: string;
  summary: SalesDocumentShift['summary'] & {
    shiftDocumentVersion?: number;
    shiftPeriod?: 'diurno' | 'nocturno' | null;
    paymentBreakdown?: Array<{
      code: string; name: string; salesAmount: number; cashFundAmount: number; receivedAmount: number;
    }>;
  };
};

export const salesShiftTitle = (shift: SalesDocumentShift & { summary: SavedSalesShift['summary'] }) => {
  if (shift.summary.shiftDocumentVersion !== 1) return shift.label;
  const period = shift.summary.shiftPeriod === 'diurno' ? 'Diurno' : shift.summary.shiftPeriod === 'nocturno' ? 'Nocturno' : '';
  return period && shift.label !== period ? `${period} - ${shift.label}` : shift.label;
};

const money = (value: number) => `Q ${value.toFixed(2)}`;
const dateTime = (value: Date) => new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short',
}).format(value);

// Este documento no recibe ventas: imprime exclusivamente el snapshot guardado.
export function createSalesShiftPdf(report: { date: string; shift: SavedSalesShift; generatedAt?: Date }, logo: string) {
  const { shift } = report;
  const summary = shift.summary;
  if (summary.accountingVersion !== 2 || summary.shiftDocumentVersion !== 1 || !Array.isArray(summary.paymentBreakdown)) {
    throw new Error('Este cierre conserva su formato anterior. Utilice el PDF original del día.');
  }
  const payments = summary.paymentBreakdown;
  const values = [summary.total, summary.cashFundTotal, summary.receivedTotal, summary.saleCount, summary.productQuantity,
    ...payments.flatMap(payment => [payment.salesAmount, payment.cashFundAmount, payment.receivedAmount])];
  if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('El cierre guardado no contiene un resumen financiero válido.');
  }
  // Comprobar integridad sin reemplazar ni reconstruir los importes guardados.
  const cents = (value: number) => Math.round(value * 100);
  const columnsToCheck = [
    ['salesAmount', summary.total], ['cashFundAmount', summary.cashFundTotal!], ['receivedAmount', summary.receivedTotal!],
  ] as const;
  if (cents(summary.total) + cents(summary.cashFundTotal!) !== cents(summary.receivedTotal!) ||
      payments.some(payment => cents(payment.salesAmount) + cents(payment.cashFundAmount) !== cents(payment.receivedAmount)) ||
      columnsToCheck.some(([key, total]) => payments.reduce((sum, payment) => sum + cents(payment[key]), 0) !== cents(total))) {
    throw new Error('El desglose del cierre guardado no coincide con sus totales.');
  }

  const doc = new jsPDF();
  const margin = 16, width = 178, bottom = 264;
  const title = salesShiftTitle(shift);
  const font = (bold = false, size = 10, color = '#2F2924') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
  };
  let y = 0;
  const write = (value: string, bold = false, size = 9) => {
    font(bold, size);
    const lines = doc.splitTextToSize(value, width - 2) as string[];
    doc.text(lines, margin, y); y += lines.length * 4.6 + 2;
  };
  const header = (continued = false) => {
    drawUnavetPdfHeader(doc, logo, 'Cierre de caja por turno');
    font(true, 17); doc.text(continued ? 'Cierre de caja - continuación' : 'Cierre de caja', margin, 47);
    y = 55;
    write(`Turno ${title} | N.º ${shift.number} | Cierre #${shift.id}`, true, 11);
    write(`Fecha: ${formatDateForDisplay(report.date)} | Cerrado: ${dateTime(new Date(shift.closedAt))}`);
    write(`Responsable: ${shift.responsible || 'No registrado'}`);
    doc.setDrawColor('#D8C1A1'); doc.line(margin, y, margin + width, y); y += 8;
  };
  const columns = [73, 35, 35, 35];
  const tableHeader = () => {
    doc.setFillColor('#6B5039'); doc.rect(margin, y, width, 9, 'F');
    font(true, 9, '#FFFFFF');
    let x = margin;
    ['Forma de pago', 'Ventas', 'Fondos', 'Recibido'].forEach((text, index) => {
      doc.text(text, index ? x + columns[index] - 3 : x + 3, y + 6, index ? { align: 'right' } : {}); x += columns[index];
    });
    y += 9;
  };
  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    if (doc.getNumberOfPages() === 2) throw new Error('El desglose supera dos páginas. Revise las formas de pago antes de imprimir.');
    doc.addPage(); header(true); tableHeader();
    if (y + height > bottom) throw new Error('Los datos del cierre exceden el espacio de impresión.');
  };
  header();
  const cardWidth = (width - 8) / 3;
  [
    ['Ingresos por ventas', summary.total], ['Fondos agregados', summary.cashFundTotal!], ['Total recibido', summary.receivedTotal!],
  ].forEach(([label, amount], index) => {
    const x = margin + index * (cardWidth + 4);
    doc.setFillColor(index === 2 ? '#EDE0CD' : '#F8F3ED');
    doc.roundedRect(x, y, cardWidth, 26, 2, 2, 'F');
    font(false, 9); doc.text(String(label), x + 3, y + 8);
    const value = money(Number(amount));
    font(true, 15);
    const size = Math.min(15, 15 * (cardWidth - 6) / doc.getTextWidth(value));
    font(true, size); doc.text(value, x + 3, y + 19);
  });
  y += 34;
  write(`Ventas realizadas: ${summary.saleCount} | Unidades de productos: ${summary.productQuantity}`, true);
  write(`Comprobantes: posteriores a #${shift.afterSaleId} y hasta #${shift.throughSaleId}`, false, 8);
  y += 3;
  write('Desglose por formas de pago', true, 11);
  tableHeader();
  if (!payments.length) { ensure(10); y += 6; write('Sin movimientos registrados.'); }
  for (const [index, payment] of payments.entries()) {
    font(false, 9);
    const cells = [payment.name, money(payment.salesAmount), money(payment.cashFundAmount), money(payment.receivedAmount)]
      .map((value, column) => doc.splitTextToSize(value, columns[column] - 8) as string[]);
    const height = Math.max(...cells.map(cell => cell.length)) * 4.4 + 5;
    ensure(height + (index === payments.length - 1 ? 14 : 0));
    doc.setFillColor(index % 2 ? '#FFFFFF' : '#F8F3ED'); doc.rect(margin, y, width, height, 'F');
    let x = margin;
    cells.forEach((cell, column) => {
      font(false, 9); doc.text(cell, column ? x + columns[column] - 3 : x + 3, y + 5, column ? { align: 'right', lineHeightFactor: 1.38 } : { lineHeightFactor: 1.38 });
      x += columns[column];
    });
    y += height;
  }
  ensure(13);
  doc.setFillColor('#EDE0CD'); doc.rect(margin, y, width, 10, 'F'); font(true, 9);
  let x = margin;
  ['Total', money(summary.total), money(summary.cashFundTotal!), money(summary.receivedTotal!)].forEach((value, column) => {
    doc.text(value, column ? x + columns[column] - 3 : x + 3, y + 6, column ? { align: 'right' } : {}); x += columns[column];
  });
  y += 18;
  if (y + 15 <= bottom) {
    write('Resumen guardado al cerrar el turno. Los fondos no son ingresos por ventas.', false, 8);
    write('El total recibido incluye todas las formas de pago; no representa solo efectivo.', false, 8);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); font(false, 7);
    doc.setDrawColor('#D8C1A1'); doc.line(margin, 277, margin + width, 277);
    doc.text(`UNAVET | Cierre #${shift.id} | Generado: ${dateTime(report.generatedAt || new Date())}`, margin, 283);
    doc.text(`Página ${page} de ${pages}`, margin + width, 283, { align: 'right' });
  }
  return doc;
}
