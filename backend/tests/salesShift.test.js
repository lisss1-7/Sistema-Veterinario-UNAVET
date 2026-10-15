const test = require('node:test');
const assert = require('node:assert/strict');
const { closeSalesShift, listSalesShifts } = require('../src/utils/salesShift');

function fixture({ latest = null, max = 20, canceledColumn = true } = {}) {
  const calls = [];
  return { calls, query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('SELECT numero')) return [latest ? [latest] : []];
    if (sql.includes('MAX(venta_id)')) return [[{ hasta_venta_id: max }]];
    if (sql.includes('information_schema')) return [canceledColumn ? [{ exists: 1 }] : []];
    if (sql.includes('AS sale_count')) return [[{ sale_count: '2', total: '125.50', product_quantity: '3' }]];
    if (sql.includes('SUM(pago.monto)')) return [[{ codigo: 'efectivo', nombre: 'Efectivo', amount: '125.50' }]];
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
  for (const query of db.calls.filter(call => /AS sale_count|SUM\(pago/.test(call.sql))) {
    assert.deepEqual(query.values, ['2026-10-13', 10, '20']);
    assert.match(query.sql, /venta\.venta_id > \? AND venta\.venta_id <= \?/);
    assert.match(query.sql, /COALESCE\(venta\.anulada, 0\) = 0/);
  }
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
