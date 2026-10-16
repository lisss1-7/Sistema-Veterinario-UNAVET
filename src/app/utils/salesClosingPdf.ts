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
