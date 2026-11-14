export type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  active: boolean;
};

export type PurchaseItem = {
  productId: string;
  quantity: number;
  unitCost: number;
  lotCode: string;
  expirationDate: string;
};

export type Purchase = {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  receipt: string;
  notes: string;
  total: number;
  canceled: boolean;
  cancellationReason: string;
  responsible: string;
  items: Array<PurchaseItem & { id: string; productName: string; lotId: string }>;
};

export type InventoryMovement = {
  id: string;
  productId: string;
  productName: string;
  date: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  lotCode: string;
  responsible: string;
  reason: string;
  origin: string;
  document: string;
  referenceId: string;
};

export const inventoryToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export const inventoryMoney = (value: number) => new Intl.NumberFormat('es-GT', {
  style: 'currency', currency: 'GTQ',
}).format(value);

export const inventoryError = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación';

type SummarySale = {
  canceled?: boolean;
  accountingVersion?: number;
  total: number;
  cashFundTotal?: number;
  hasSales?: boolean;
  payments: Array<{ code: string; amount: number; cashFundAmount?: number }>;
  items: Array<{ type: string; quantity: number }>;
};

export const calculateSalesTotals = (sales: SummarySale[]) => sales.reduce((result, sale) => {
  if (sale.canceled) return result;
  const round = (value: number) => Math.round(value * 100) / 100;
  const corrected = sale.accountingVersion === 2;
  const fund = corrected ? Number(sale.cashFundTotal || 0) : 0;
  if (!corrected || sale.hasSales !== false) result.saleCount += 1;
  result.total = corrected ? round(result.total + sale.total - fund) : result.total + sale.total;
  result.cashFundTotal = round(result.cashFundTotal + fund);
  result.receivedTotal = round(result.receivedTotal + sale.total);
  for (const payment of sale.payments) {
    const amount = (payment.amount - (corrected ? Number(payment.cashFundAmount || 0) : 0));
    if (corrected && amount === 0 && payment.cashFundAmount) continue;
    result.byMethod[payment.code] = corrected ? round((result.byMethod[payment.code] || 0) + amount) : (result.byMethod[payment.code] || 0) + amount;
  }
  for (const item of sale.items) if (item.type === 'Producto') result.productQuantity += item.quantity;
  return result;
}, { byMethod: {} as Record<string, number>, total: 0, cashFundTotal: 0, receivedTotal: 0, saleCount: 0, productQuantity: 0 });
