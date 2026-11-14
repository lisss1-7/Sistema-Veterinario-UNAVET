const test = require('node:test');
const assert = require('node:assert/strict');
process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '0';
const { closeSalesShift, listSalesShifts } = require('../src/utils/salesShift');

function fixture({ latest = null, max = 20, canceledColumn = true, sales = [
  { venta_id: 11, sale_count: 1, total: '75.50', cash_fund_total: '0', product_quantity: '2' },
  { venta_id: 12, sale_count: 1, total: '50', cash_fund_total: '0', product_quantity: '1' },
], payments = [
  { venta_id: 11, codigo: 'efectivo', nombre: 'Efectivo', amount: '75.50' },
  { venta_id: 12, codigo: 'efectivo', nombre: 'Efectivo', amount: '50' },
] } = {}) {
  const calls = [];
  return { calls, query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('AS accounting_cutoff')) return [[]];
    if (sql.includes('SELECT numero')) return [latest ? [latest] : []];
    if (sql.includes('MAX(venta_id)')) return [[{ hasta_venta_id: max }]];
    if (sql.includes('information_schema')) return [canceledColumn ? [{ exists: 1 }] : []];
    if (sql.includes('AS sale_count')) return [sales];
    if (sql.includes('FROM venta_pago')) return [payments];
    if (sql.includes('INSERT INTO')) return [{ insertId: 8 }];
    throw Error('Unexpected query');
  } };
}
test('turno sucesivo incluye únicamente ventas posteriores al límite anterior', async () => {
  const db = fixture({ latest: { numero: 4, hasta_venta_id: 10 } });
  const result = await closeSalesShift(db, { date: '2026-10-13', expectedNumber: 5, userId: '7' });
  assert.equal(result.number, 5);
  assert.equal(result.summary.total, 125.5);
  assert.deepEqual(result.summary.payments, [{ code: 'efectivo', name: 'Efectivo', amount: 125.5 }]);
  for (const query of db.calls.filter(call => /AS sale_count|FROM venta_pago/.test(call.sql))) {
    assert.deepEqual(query.values, ['2026-10-13', 10, '20']);
    assert.match(query.sql, /venta\.venta_id > \? AND venta\.venta_id <= \?/);
    assert.ok(!query.sql.includes('venta.anulada'));
  }
});
test('fondo y comprobantes mixtos se separan de ingresos y pagos del turno', async () => {
  const db = fixture({ sales: [
    { venta_id: 11, sale_count: 0, total: '100', cash_fund_total: '100', product_quantity: 0 },
    { venta_id: 12, sale_count: 1, total: '90', cash_fund_total: '30', product_quantity: 2 },
  ], payments: [
    { venta_id: 11, codigo: 'efectivo', nombre: 'Efectivo', amount: '100' },
    { venta_id: 12, codigo: 'efectivo', nombre: 'Efectivo', amount: '60' },
    { venta_id: 12, codigo: 'tarjeta', nombre: 'Tarjeta', amount: '30' },
  ] });
  const { summary } = await closeSalesShift(db, { date: '2026-11-13', expectedNumber: 1 });
  assert.deepEqual(summary, { accountingVersion: 2, accountingStartAfterSaleId: '0', saleCount: 1, total: 60, cashFundTotal: 130, receivedTotal: 190, productQuantity: 2, payments: [
    { code: 'efectivo', name: 'Efectivo', amount: 40 },
    { code: 'tarjeta', name: 'Tarjeta', amount: 20 },
  ], shiftDocumentVersion: 1, shiftPeriod: 'diurno', paymentBreakdown: [
    { code: 'efectivo', name: 'Efectivo', salesAmount: 40, cashFundAmount: 120, receivedAmount: 160 },
    { code: 'tarjeta', name: 'Tarjeta', salesAmount: 20, cashFundAmount: 10, receivedAmount: 30 },
  ] });
});
test('un turno sin movimientos conserva sus totales en cero', async () => {
  const { summary } = await closeSalesShift(fixture({ sales: [], payments: [], max: 0 }), { date: '2026-11-13', expectedNumber: 1 });
  assert.deepEqual(summary, { accountingVersion: 2, accountingStartAfterSaleId: '0', shiftDocumentVersion: 1, shiftPeriod: 'diurno', paymentBreakdown: [], saleCount: 0, total: 0, cashFundTotal: 0, receivedTotal: 0, productQuantity: 0, payments: [] });
});
test('rechaza un cierre repetido o desactualizado, incluso si el turno está vacío', async () => {
  const db = fixture({ latest: { numero: 2, hasta_venta_id: 20 }, max: 20 });
  await assert.rejects(closeSalesShift(db, { date: '2026-10-13', expectedNumber: 2 }), { statusCode: 409 });
  assert.equal(db.calls.length, 1);
});
test('finalizar día no añade otro turno vacío si el último ya estaba cerrado', async () => {
  const db = fixture({ latest: { numero: 2, hasta_venta_id: 20 }, max: 20 });
  assert.equal(await closeSalesShift(db, { date: '2026-10-13', onlyIfPending: true }), null);
  assert.equal(db.calls.length, 2);
});
test('el límite no retrocede si se eliminaron ventas del turno anterior', async () => {
  const db = fixture({ latest: { numero: 2, hasta_venta_id: 20 }, max: 10, canceledColumn: false });
  await closeSalesShift(db, { date: '2026-10-13', expectedNumber: 3 });
  const insert = db.calls.find(call => call.sql.includes('INSERT INTO'));
  assert.equal(insert.values[3], 20);
  assert.equal(insert.values[4], '20');
  assert.ok(!db.calls.find(call => call.sql.includes('AS sale_count')).sql.includes('venta.anulada'));
});
test('consulta conserva snapshot y convierte hora de cierre sin depender de zona del host', async () => {
  const summary = { saleCount: 1, total: 10, productQuantity: 0, payments: [] };
  const rows = await listSalesShifts({ query: async () => [[{ turno_id: 1, numero: 1, desde_venta_id: 0, hasta_venta_id: 15, closed_ms: 1791907200000, finalizado_por: 7, responsable: 'Usuario de prueba', resumen: JSON.stringify(summary) }]] }, '2026-10-13');
  assert.deepEqual(rows[0].summary, summary);
  assert.equal(rows[0].closedAt, new Date(1791907200000).toISOString());
});


test('un cierre nuevo conserva importes antiguos pendientes del mismo turno', async t => {
  process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '11';
  t.after(() => { process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '0'; });
  const { summary } = await closeSalesShift(fixture({ sales: [
    { venta_id: 11, sale_count: 0, total: 100, cash_fund_total: 100, product_quantity: 0 },
    { venta_id: 12, sale_count: 0, total: 50, cash_fund_total: 50, product_quantity: 0 },
  ], payments: [
    { venta_id: 11, codigo: 'efectivo', nombre: 'Efectivo', amount: 100 },
    { venta_id: 12, codigo: 'efectivo', nombre: 'Efectivo', amount: 50 },
  ] }), { date: '2026-11-13' });
  assert.deepEqual(summary, { accountingVersion: 2, accountingStartAfterSaleId: '11', saleCount: 1,
    total: 100, cashFundTotal: 50, receivedTotal: 150, productQuantity: 0,
    payments: [{ code: 'efectivo', name: 'Efectivo', amount: 100 }], shiftDocumentVersion: 1, shiftPeriod: 'diurno',
    paymentBreakdown: [{ code: 'efectivo', name: 'Efectivo', salesAmount: 100, cashFundAmount: 50, receivedAmount: 150 }] });
});

test('el primer cierre se identifica Diurno y el segundo Nocturno sin reutilizar su rango', async () => {
  const day = fixture({ max: 12 });
  const first = await closeSalesShift(day, { date: '2026-11-13', expectedNumber: 1 });
  assert.equal(first.summary.shiftPeriod, 'diurno');
  assert.equal(day.calls.find(call => call.sql.includes('INSERT INTO')).values[2], 'Diurno');
  const night = fixture({ latest: { numero: 1, hasta_venta_id: 12 }, max: 14, sales: [
    { venta_id: 13, sale_count: 0, total: 50, cash_fund_total: 50, product_quantity: 0 },
    { venta_id: 14, sale_count: 1, total: 80, cash_fund_total: 0, product_quantity: 0 },
  ], payments: [
    { venta_id: 13, codigo: 'efectivo', nombre: 'Efectivo', amount: 50 },
    { venta_id: 14, codigo: 'tarjeta', nombre: 'Tarjeta', amount: 80 },
  ] });
  const second = await closeSalesShift(night, { date: '2026-11-13', expectedNumber: 2 });
  assert.equal(second.summary.shiftPeriod, 'nocturno');
  assert.equal(second.summary.total, 80);
  assert.equal(second.summary.cashFundTotal, 50);
  const insert = night.calls.find(call => call.sql.includes('INSERT INTO'));
  assert.equal(insert.values[2], 'Nocturno');
  assert.deepEqual(insert.values.slice(3, 5), [12, '14']);
  assert.deepEqual(second.summary.paymentBreakdown, [
    { code: 'efectivo', name: 'Efectivo', salesAmount: 0, cashFundAmount: 50, receivedAmount: 50 },
    { code: 'tarjeta', name: 'Tarjeta', salesAmount: 80, cashFundAmount: 0, receivedAmount: 80 },
  ]);
});

test('sin activacion el cierre nuevo mantiene exactamente el formato y calculo anterior', async t => {
  delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
  t.after(() => { process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '0'; });
  const db = fixture({ sales: [{ sale_count: 2, total: 150, product_quantity: 0 }],
    payments: [{ codigo: 'efectivo', nombre: 'Efectivo', amount: 150 }] });
  const { summary } = await closeSalesShift(db, { date: '2026-11-13' });
  assert.deepEqual(summary, { saleCount: 2, total: 150, productQuantity: 0,
    payments: [{ code: 'efectivo', name: 'Efectivo', amount: 150 }] });
  assert.ok(db.calls.find(call => call.sql.includes('AS sale_count')).sql.includes('COUNT(DISTINCT'));
});
