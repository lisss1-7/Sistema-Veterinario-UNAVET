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
  assert.deepEqual(result, { byMethod: { efectivo: 65 }, total: 65, saleCount: 2, productQuantity: 3 });
});

test('un cierre compuesto solo de ventas anuladas conserva totales en cero', () => {
  assert.deepEqual(operations.calculateSalesTotals([{ canceled: true, total: 50, payments: [{ code: 'efectivo', amount: 50 }], items: [{ type: 'Producto', quantity: 5 }] }]),
    { byMethod: {}, total: 0, saleCount: 0, productQuantity: 0 });
});
