const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const dbPath = require.resolve('../src/config/db');
const db = { query: async () => [[]], getConnection: async () => { throw new Error('No debe abrirse una conexión'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { normalizePurchase, crearCompra, anularCompra, guardarProveedor, listarMovimientos } = require('../src/controllers/inventarioOperacionesController');
const body = () => ({ supplierId: 1, date: '2026-01-01', requestKey: randomUUID(), items: [{ productId: 1, quantity: 20, unitCost: 5.25 }] });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('calcula costos en centavos y conserva filas separadas para diferentes lotes', () => {
  const purchase = normalizePurchase({ ...body(), items: [{ productId: 2, quantity: 3, unitCost: 0.1, lotCode: 'A' }, { productId: 2, quantity: 1, unitCost: 0.2, lotCode: 'B' }] });
  assert.equal(purchase.totalCents, 50);
  assert.equal(purchase.items.length, 2);
});

test('rechaza cantidades inválidas, costos inválidos y fechas imposibles', () => {
  for (const change of [
    { quantity: 0 }, { quantity: 1.5 }, { quantity: -1 }, { quantity: null },
    { unitCost: -1 }, { unitCost: 'abc' }, { unitCost: null }, { unitCost: 1.001 },
    { expirationDate: '2026-02-30' }, { expirationDate: '2025-12-31' },
  ]) assert.throws(() => normalizePurchase({ ...body(), items: [{ ...body().items[0], ...change }] }));
  assert.throws(() => normalizePurchase({ ...body(), date: '2099-01-01' }));
  assert.throws(() => normalizePurchase({ ...body(), date: '2026-02-30' }));
  assert.throws(() => normalizePurchase({ ...body(), supplierId: 'x' }));
});

test('rechaza una compra vacía antes de acceder a la base', async () => {
  const res = response();
  await crearCompra({ body: { ...body(), items: [] }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 400);
});

test('rechaza una anulación sin motivo antes de acceder a la base', async () => {
  const res = response();
  await anularCompra({ params: { id: 1 }, body: { reason: ' ' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 400);
});

test('rechaza proveedor sin nombre y filtros de movimientos inválidos', async () => {
  const res = response();
  await guardarProveedor({ params: {}, body: { name: ' ' } }, res);
  assert.equal(res.statusCode, 400);
  for (const query of [{ from: '2026-99-01' }, { origin: 'SQL' }, { productId: -1 }, { page: 0 }]) {
    const result = response();
    await listarMovimientos({ query }, result);
    assert.equal(result.statusCode, 400);
  }
});
