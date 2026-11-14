import type { jsPDF } from 'jspdf';
import type { Prescription } from './types';

export interface PrescriptionProcedure {
  serviceId: string;
  name: string;
  description: string;
  unitPrice: number;
  quantity: number;
  subtotal?: number;
}
export interface PrescriptionConsultation extends Prescription {
  consultationVersion?: 1;
  weightKg?: number | null;
  procedures?: PrescriptionProcedure[];
  procedureTotal?: number;
}

export const KG_PER_LB = 0.45359237;
export const prescriptionWeightKg = (value: string, unit: 'kg' | 'lb') => {
  if (!value.trim()) return null;
  const kg = Number(value) * (unit === 'lb' ? KG_PER_LB : 1);
  return Number.isFinite(kg) && kg >= 0.000001 && kg <= 9999.999999 ? Math.round(kg * 1e6) / 1e6 : NaN;
};
export const prescriptionWeightText = (kg: number | null | undefined) => {
  if (kg === null || kg === undefined) return 'No registrado';
  const format = (value: number) => value.toLocaleString('es-GT', { maximumFractionDigits: 6 });
  return `${format(kg)} kg / ${format(kg / KG_PER_LB)} lb`;
};
export const procedureSubtotal = (item: PrescriptionProcedure) => Math.round(item.unitPrice * 100) * item.quantity / 100;
export const procedureTotal = (items: PrescriptionProcedure[]) => items.reduce((sum, item) => sum + Math.round(procedureSubtotal(item) * 100), 0) / 100;

export function drawPrescriptionProcedures(doc: jsPDF, items: PrescriptionProcedure[], startY: number, nextPage: () => number) {
  let y = startY;
  const money = (value: number) => `Q ${value.toFixed(2)}`;
  const heading = () => {
    doc.setTextColor('#2F2924'); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Servicios y procedimientos realizados', 15, y); y += 7;
    doc.setFillColor('#6B6258'); doc.rect(15, y, 180, 9, 'F');
    doc.setTextColor('#FFFFFF'); doc.setFontSize(9);
    doc.text('Descripción', 18, y + 6); doc.text('Cant.', 125, y + 6, { align: 'right' });
    doc.text('Precio', 157, y + 6, { align: 'right' }); doc.text('Subtotal', 192, y + 6, { align: 'right' }); y += 9;
  };
  if (y > 222) y = nextPage();
  heading();
  for (const item of items) {
    const lines = doc.splitTextToSize(`${item.name}${item.description ? `: ${item.description}` : ''}`, 97) as string[];
    if (y + lines.length * 5 + 4 > 250 && lines.length * 5 + 4 <= 190) {
      y = nextPage(); heading();
    }
    let offset = 0;
    while (offset < lines.length) {
      if (y > 240) { y = nextPage(); heading(); }
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((250 - y - 4) / 5)));
      const height = count * 5 + 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#2F2924');
      doc.setDrawColor('#D8D2C8'); doc.setLineWidth(0.25); doc.rect(15, y, 180, height);
      doc.text(lines.slice(offset, offset + count), 18, y + 6);
      if (!offset) {
        doc.text(String(item.quantity), 125, y + 6, { align: 'right' });
        doc.text(money(item.unitPrice), 157, y + 6, { align: 'right' });
        doc.text(money(procedureSubtotal(item)), 192, y + 6, { align: 'right' });
      }
      offset += count; y += height;
    }
  }
  if (y > 226) y = nextPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor('#2F2924');
  const total = money(procedureTotal(items));
  doc.text(`Subtotal de procedimientos: ${total}`, 195, y + 8, { align: 'right' });
  doc.text(`Total de procedimientos: ${total}`, 195, y + 15, { align: 'right' });
  return y + 28;
}
