import { jsPDF } from 'jspdf';

import { drawUnavetPdfHeader } from './pdfBranding';

export type AuditReportItem = {
  productId: string;
  name: string;
  category: string;
  unit: string;
  systemStock: number;
  physicalStock: number;
  difference: number;
  notes: string;
};

export type AuditReport = {
  id: string;
  code: string;
  auditDate: string;
  startedAt: string;
  completedAt: string;
  auditor: string;
  totalProducts: number;
  discrepancies: number;
  items: AuditReportItem[];
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const formatAuditDate = (value: string) =>
  new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));

const formatAuditMonth = (value: string) =>
  new Intl.DateTimeFormat('es-GT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));

export const createInventoryAuditPdf = (
  report: AuditReport,
  logoBase64: string
) => {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const tableWidth = pageWidth - marginX * 2;
  const columns = [
    { label: 'Producto', width: 48 },
    { label: 'Categoría', width: 35 },
    { label: 'Unidad', width: 25 },
    { label: 'Sistema', width: 22 },
    { label: 'Físico', width: 22 },
    { label: 'Diferencia', width: 23 },
    { label: 'Estado', width: 28 },
    { label: 'Notas', width: tableWidth - 203 },
  ];

  const drawTableHeader = (startY: number) => {
    let x = marginX;
    doc.setFillColor('#5C4331');
    doc.rect(marginX, startY, tableWidth, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#FFFFFF');
    columns.forEach((column) => {
      doc.text(column.label, x + 2, startY + 5.8);
      x += column.width;
    });
    return startY + 9;
  };

  const drawPageHeader = (continuation = false) => {
    drawUnavetPdfHeader(doc, logoBase64, 'Auditoría física de inventario');
    doc.setTextColor('#2F2A25');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(
      continuation
        ? `Auditoría de inventario ${report.code} (continuación)`
        : `Auditoría de inventario ${report.code}`,
      marginX,
      43
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Auditor: ${report.auditor}`, marginX, 50);
    doc.text(
      `Periodo auditado: ${formatAuditMonth(report.auditDate)}  |  Fecha seleccionada: ${formatAuditDate(report.auditDate)}`,
      marginX,
      56
    );
    doc.text(
      `Inicio: ${formatDateTime(report.startedAt)}  |  Finalización: ${formatDateTime(report.completedAt)}`,
      marginX,
      62
    );
    doc.text(
      `Productos contados: ${report.totalProducts}  |  Con diferencias: ${report.discrepancies}`,
      marginX,
      68
    );
    return drawTableHeader(73);
  };

  let y = drawPageHeader();

  report.items.forEach((item, index) => {
    const state = item.difference === 0 ? 'Correcto' : 'Con diferencia';
    const values = [
      item.name,
      item.category,
      item.unit,
      String(item.systemStock),
      String(item.physicalStock),
      item.difference > 0 ? `+${item.difference}` : String(item.difference),
      state,
      item.notes || 'Sin observaciones',
    ];
    const lines = values.map((value, columnIndex) =>
      doc.splitTextToSize(value, columns[columnIndex].width - 4) as string[]
    );
    const rowHeight = Math.max(
      9,
      ...lines.map((valueLines) => valueLines.length * 3.6 + 3)
    );

    if (y + rowHeight > pageHeight - 18) {
      doc.addPage();
      y = drawPageHeader(true);
    }

    if (index % 2 === 0) {
      doc.setFillColor('#F5F0EB');
      doc.rect(marginX, y, tableWidth, rowHeight, 'F');
    }

    let x = marginX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#2F2A25');
    lines.forEach((valueLines, columnIndex) => {
      doc.text(valueLines, x + 2, y + 5);
      x += columns[columnIndex].width;
    });
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor('#B99572');
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    doc.setFontSize(8);
    doc.setTextColor('#6B625B');
    doc.text('Sistema Veterinario UNAVET', marginX, pageHeight - 7);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - marginX, pageHeight - 7, {
      align: 'right',
    });
  }

  return doc;
};
