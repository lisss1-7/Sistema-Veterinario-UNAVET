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
  total: number;
  payments: Array<{ code: string; amount: number }>;
  items: Array<{ type: string; quantity: number }>;
};

export const calculateSalesTotals = (sales: SummarySale[]) => sales.reduce((result, sale) => {
  if (sale.canceled) return result;
  result.saleCount += 1;
  result.total += sale.total;
  for (const payment of sale.payments) result.byMethod[payment.code] = (result.byMethod[payment.code] || 0) + payment.amount;
  for (const item of sale.items) if (item.type === 'Producto') result.productQuantity += item.quantity;
  return result;
}, { byMethod: {} as Record<string, number>, total: 0, saleCount: 0, productQuantity: 0 });
