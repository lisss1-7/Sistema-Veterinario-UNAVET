const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { weightKg, prepare, save, enrich, totals } = require('../src/utils/prescriptionConsultation');

test('convierte libras usando la equivalencia exacta y guarda solo kg con seis decimales', () => {
  assert.equal(weightKg({ value: '10', unit: 'kg' }), 10);
  assert.equal(weightKg({ value: 22.0462262185, unit: 'lb' }), 10);
  assert.equal(weightKg({ value: '1', unit: 'lb' }), 0.453592);
  assert.equal(weightKg({ value: 0.002, unit: 'kg' }), 0.002);
  assert.equal(weightKg(null), null);
});
test('rechaza cero, negativos, unidades desconocidas y valores no numéricos o fuera del rango', () => {
  for (const value of ['', ' ', 0, -1, Infinity, NaN, 10000, true, {}, []]) assert.throws(() => weightKg({ value, unit: 'kg' }), /peso/);
  assert.throws(() => weightKg({ value: 3, unit: 'oz' }), /peso/);
});
const harness = ({ migrated = true, saved = null, price = '123.45', active = true } = {}) => {
  const writes = [];
  const connection = { query: async (sql, values) => {
    if (sql.includes('prescription_consultation_tables')) return [[{ prescription_consultation_tables: migrated ? 1 : 0 }]];
    if (sql.startsWith('SELECT receta_id')) return [saved ? [{ receta_id: 7, peso_kg: saved.kg, procedimientos: JSON.stringify(saved.procedures) }] : []];
    if (sql.includes('FROM servicio s')) return [active ? [{ nombre: 'Procedimiento de prueba', descripcion: 'Descripción', precio_base: price }] : []];
    if (sql.startsWith('INSERT INTO receta_consulta')) { writes.push({ sql, values }); return [{ affectedRows: 1 }]; }
    throw Error(`Consulta inesperada: ${sql}`);
  } };
  return { connection, writes };
};
test('toma precios del catálogo e ignora precios y totales manipulados por el cliente', async () => {
  const { connection, writes } = harness();
  const details = await prepare(connection, { weight: { value: '10', unit: 'lb' }, procedures: [
    { serviceId: '1', quantity: 2, unitPrice: 0, subtotal: 0 }, { serviceId: '2', quantity: 1, unitPrice: 1 },
  ] });
  assert.equal(details.kg, 4.535924);
  assert.equal(totals(details.procedures).procedureTotal, 370.35);
  await save(connection, 7, details);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].values, [7, 4.535924, JSON.stringify(details.procedures)]);
});
test('los precios y descripciones emitidos sobreviven a cambios o bajas del catálogo', async () => {
  const saved = { kg: 3, procedures: [{ serviceId: '1', name: 'Nombre original', description: 'Original', unitPrice: 10.01, quantity: 3 }] };
  const { connection } = harness({ saved, active: false });
  const details = await prepare(connection, { procedures: [{ serviceId: '1', quantity: 2, unitPrice: 999 }] }, { id: '7' });
  assert.equal(details.kg, 3);
  assert.deepEqual(details.procedures[0], { ...saved.procedures[0], quantity: 2 });
  const [recipe] = await enrich(connection, [{ id: '7', medications: [{ productName: 'Medicamento' }] }]);
  assert.equal(recipe.weightKg, 3); assert.equal(recipe.procedureTotal, 30.03);
  assert.equal(recipe.medications[0].productName, 'Medicamento');
  assert.equal((await prepare(connection, {}, { id: '7' })).kg, 3);
});
test('no modifica objetos históricos ni agrega metadatos al editar recetas anteriores', async () => {
  const { connection } = harness(); const old = { id: '7', date: '2020-01-01', medications: [] };
  const [result] = await enrich(connection, [old]); assert.equal(result, old);
  assert.equal(await prepare(connection, {}, { id: '7' }), null);
  await assert.rejects(prepare(connection, { weight: null }, { id: '7' }), /anteriores/);
});
test('sin migración conserva lectores y clientes anteriores y rechaza guardar datos nuevos', async () => {
  const { connection } = harness({ migrated: false }); const old = { id: '7' };
  assert.equal((await enrich(connection, [old]))[0], old);
  assert.equal(await prepare(connection, {}), null);
  await assert.rejects(prepare(connection, { procedures: [] }), { statusCode: 503 });
});
test('valida servicios, cantidades, precios, duplicados y cambio de paciente', async () => {
  const { connection } = harness();
  for (const procedures of [null, {}, Array(101).fill({}), [{ serviceId: '1', quantity: 0 }],
    [{ serviceId: '1', quantity: 1.5 }], [{ serviceId: '1', quantity: 1001 }], [{ serviceId: '1', quantity: true }],
    [{ serviceId: 'bad', quantity: 1 }], [{ serviceId: '1', quantity: 1 }, { serviceId: '1', quantity: 2 }]]) {
    await assert.rejects(prepare(connection, { procedures }), { statusCode: 400 });
  }
  await assert.rejects(prepare(harness({ active: false }).connection, { procedures: [{ serviceId: '1', quantity: 1 }] }), /disponible/);
  await assert.rejects(prepare(harness({ price: null }).connection, { procedures: [{ serviceId: '1', quantity: 1 }] }), /precio/);
  await assert.rejects(prepare(harness({ saved: { kg: 5, procedures: [] } }).connection, {}, { id: '7', patientChanged: true }), /paciente/);
});
test('migración aditiva sin actualizaciones masivas; consultas nuevas no generan ventas ni inventario', () => {
  const migration = fs.readFileSync(require.resolve('../src/scripts/prescriptionConsultationMigration.sql'), 'utf8').replace(/^--.*$/gm, '');
  assert.match(migration, /receta_id BIGINT UNSIGNED/); assert.match(migration, /peso_kg DECIMAL\(10,6\)/);
  assert.ok(!/\bALTER|\bUPDATE|\bDELETE|\bINSERT|\bDROP/i.test(migration));
  const source = fs.readFileSync(require.resolve('../src/utils/prescriptionConsultation'), 'utf8');
  assert.ok(!/INSERT INTO (venta|cierre|movimiento|historial|paciente)/.test(source));
});
