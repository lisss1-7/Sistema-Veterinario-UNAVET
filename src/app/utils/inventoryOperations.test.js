import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, operations;
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  operations = await server.ssrLoadModule('/src/app/utils/inventoryOperations.ts');
});
test.after(async () => { await server?.close(); });

test('excluye ventas anuladas de ingresos, pagos, conteo y productos vendidos', () => {
  const result = operations.calculateSalesTotals([
    { total: 45, payments: [{ code: 'efectivo', amount: 45 }], items: [{ type: 'Producto', quantity: 3 }] },
    { total: 20, payments: [{ code: 'efectivo', amount: 20 }], items: [{ type: 'Servicio', quantity: 1 }] },
    { total: 100, canceled: true, payments: [{ code: 'tarjeta', amount: 100 }], items: [{ type: 'Producto', quantity: 10 }] },
  ]);
  assert.deepEqual(result, { byMethod: { efectivo: 65 }, total: 65, cashFundTotal: 0, receivedTotal: 65, saleCount: 2, productQuantity: 3 });
});

test('un cierre compuesto solo de ventas anuladas conserva totales en cero', () => {
  assert.deepEqual(operations.calculateSalesTotals([{ canceled: true, total: 50, payments: [{ code: 'efectivo', amount: 50 }], items: [{ type: 'Producto', quantity: 5 }] }]),
    { byMethod: {}, total: 0, cashFundTotal: 0, receivedTotal: 0, saleCount: 0, productQuantity: 0 });
});

test('el fondo no cuenta como venta ni ingreso y se conserva en el total recibido', () => {
  assert.deepEqual(operations.calculateSalesTotals([
    { total: 100, cashFundTotal: 100, hasSales: false, payments: [{ code: 'efectivo', amount: 100, cashFundAmount: 100 }], items: [{ type: 'Servicio', quantity: 1 }] },
    { total: 75, hasSales: true, payments: [{ code: 'efectivo', amount: 75 }], items: [{ type: 'Producto', quantity: 3 }] },
    { total: 999, cashFundTotal: 999, hasSales: false, canceled: true, payments: [{ code: 'efectivo', amount: 999, cashFundAmount: 999 }], items: [] },
  ]), { byMethod: { efectivo: 75 }, total: 75, cashFundTotal: 100, receivedTotal: 175, saleCount: 1, productQuantity: 3 });
});

test('comprobante mixto y servicio gratuito conservan el conteo de ventas y sus pagos', () => {
  assert.deepEqual(operations.calculateSalesTotals([
    { total: 90, cashFundTotal: 30, hasSales: true, payments: [{ code: 'efectivo', amount: 60, cashFundAmount: 20 }, { code: 'tarjeta', amount: 30, cashFundAmount: 10 }], items: [{ type: 'Producto', quantity: 2 }] },
    { total: 0, hasSales: true, payments: [], items: [{ type: 'Servicio', quantity: 1 }] },
  ]), { byMethod: { efectivo: 40, tarjeta: 20 }, total: 60, cashFundTotal: 30, receivedTotal: 90, saleCount: 2, productQuantity: 2 });
});

test('solo fondo deja ingresos y ventas en cero', () => {
  assert.deepEqual(operations.calculateSalesTotals([
    { total: 0.3, cashFundTotal: 0.3, hasSales: false, payments: [{ code: 'efectivo', amount: 0.3, cashFundAmount: 0.3 }], items: [] },
  ]), { byMethod: {}, total: 0, cashFundTotal: 0.3, receivedTotal: 0.3, saleCount: 0, productQuantity: 0 });
});
