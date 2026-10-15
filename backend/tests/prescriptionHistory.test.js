const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/config/db');
const lotsPath = require.resolve('../src/utils/inventoryLots');
let query;
const events = [];
const connection = {
  query: (...args) => query(...args),
  beginTransaction: async () => events.push('begin'),
  commit: async () => events.push('commit'),
  rollback: async () => events.push('rollback'),
  release: () => events.push('release'),
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query: (...args) => query(...args), getConnection: async () => connection,
} };
require.cache[lotsPath] = { id: lotsPath, filename: lotsPath, loaded: true, exports: {
  consumeLots: async (data) => { events.push(['consume', data.quantity]); return { allocations: [{ lotId: 5, quantity: data.quantity }] }; },
  restoreLots: async () => events.push('restore'),
} };
const { crearReceta, actualizarReceta, obtenerRecetas } = require('../src/controllers/recetasController');
const { listarHistorialPorPaciente } = require('../src/controllers/historialController');
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const medicine = { productName: 'Medicamento de prueba', quantity: 2, instructions: 'Cada 12 horas', deliveryMode: 'Compra externa' };

test('carga los medicamentos de varias recetas en una sola consulta sin mezclarlos', async () => {
  let calls = 0;
  query = async (sql, values) => {
    calls++;
    if (sql.includes('FROM receta r')) return [[{ receta_id: 12, paciente_id: 4 }, { receta_id: 13, paciente_id: 5 }, { receta_id: 14, paciente_id: 4 }]];
    assert.match(sql, /rm\.receta_id IN \(\?, \?, \?\)/);
    assert.deepEqual(values, [12, 13, 14]);
    return [[{ receta_id: 13, receta_medicamento_id: 2, nombre_medicamento: 'B', cantidad: 2 }, { receta_id: 12, receta_medicamento_id: 1, nombre_medicamento: 'A', cantidad: 1 }]];
  };
  const result = await obtenerRecetas(connection);
  assert.equal(calls, 2);
  assert.deepEqual(result.map(recipe => recipe.medications.map(medication => medication.productName)), [['A'], ['B'], []]);
});

const configureWrites = ({ clinic = false, annulled = false } = {}) => {
  events.length = 0;
  query = async (sql, values) => {
    events.push({ sql, values });
    if (sql.includes('FROM paciente')) return [[{ paciente_id: 4, tutor_id: 2 }]];
    if (sql.includes('FROM veterinario')) return [[{ veterinario_id: 3 }]];
    if (sql.includes('FROM modo_entrega_receta')) return [[{ modo_entrega_id: 2, descuenta_inventario: clinic ? 1 : 0 }]];
    if (sql.includes('FROM receta receta')) return [[{ receta_id: 12, es_anulado: annulled ? 1 : 0 }]];
    if (sql.includes('FROM receta_medicamento medicamento')) return [[]];
    if (/INSERT INTO|UPDATE receta|DELETE FROM receta_medicamento/.test(sql)) return [{ insertId: 12, affectedRows: 1 }];
    throw Error('Unexpected query');
  };
};

test('crea receta con motivo sin diagnóstico y conserva medicamentos y autor', async () => {
  configureWrites();
  const res = response();
  await crearReceta({ body: { patientId: '4', reason: 'Control preventivo', medications: [medicine] }, user: { id: 8 } }, res);
  assert.equal(res.code, 201);
  const write = events.find(event => event.sql?.includes('INSERT INTO receta ('));
  assert.match(write.sql, /motivo_consulta/);
  assert.deepEqual(write.values, ['4', 2, 3, '', 'Control preventivo', null, 8]);
  assert.ok(events.some(event => event.sql?.includes('INSERT INTO receta_medicamento')));
  assert.ok(events.includes('commit'));
  assert.ok(!events.some(event => Array.isArray(event) && event[0] === 'consume'));
});

test('editar permite quitar el diagnóstico y mantiene el reajuste de inventario', async () => {
  configureWrites({ clinic: true });
  const res = response();
  await actualizarReceta({ params: { id: '12' }, body: { patientId: '4', veterinarianId: '3', diagnosis: '', reason: 'Seguimiento', medications: [{ ...medicine, productId: '9', deliveryMode: 'Entregado en clínica' }] }, user: { id: 8 } }, res);
  assert.equal(res.code, 200);
  const write = events.find(event => event.sql?.includes('UPDATE receta'));
  assert.deepEqual(write.values, ['4', 2, '3', '', 'Seguimiento', null, '12']);
  assert.ok(events.includes('restore'));
  assert.ok(events.some(event => Array.isArray(event) && event[0] === 'consume' && event[1] === 2));
  assert.ok(events.includes('commit'));
});

test('mantiene la validación de entrega en clínica y revierte la transacción', async () => {
  configureWrites({ clinic: true });
  const res = response();
  await crearReceta({ body: { patientId: '4', medications: [{ ...medicine, deliveryMode: 'Entregado en clínica' }] }, user: { id: 8 } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /desde inventario/);
  assert.ok(events.includes('rollback'));
  assert.ok(!events.includes('commit'));
});

test('historial mezcla consultas y recetas del paciente sin escribir duplicados', async () => {
  let status = 'Emitida';
  query = async (sql, values) => {
    assert.ok(!/INSERT|UPDATE|DELETE/.test(sql));
    if (sql.includes('FROM historial_clinico historial')) return [[{ historial_id: 12, paciente_id: 4, fecha: '2026-10-01', tipo_consulta: 'Consulta', estado_clinico: 'Completado' }]];
    if (sql.includes('FROM receta r')) {
      assert.match(sql, /WHERE \(\? IS NULL OR r\.paciente_id = \?\)/);
      assert.deepEqual(values, ['4', '4']);
      return [[{ receta_id: 12, paciente_id: 4, fecha_emision: '2026-10-02', motivo_consulta: 'Control', diagnostico: null, estado: status, creado_por: 8, creado_por_nombre: 'Veterinario' }]];
    }
    if (sql.includes('FROM receta_medicamento rm')) return [[{ receta_id: 12, receta_medicamento_id: 3, nombre_medicamento: 'Medicamento', cantidad: 2, indicaciones: 'Cada 12 horas', modo_entrega: 'Compra externa' }]];
    throw Error('Unexpected query');
  };
  const res = response();
  await listarHistorialPorPaciente({ params: { pacienteId: '4' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.map(record => record.id), ['prescription-12', '12']);
  assert.equal(res.body[0].diagnosis, '');
  assert.equal(res.body[0].reason, 'Control');
  assert.match(res.body[0].treatment, /Cada 12 horas/);
  assert.equal(res.body[0].createdByName, 'Veterinario');
  status = 'Anulada';
  await listarHistorialPorPaciente({ params: { pacienteId: '4' } }, res);
  assert.equal(res.body[0].prescriptionStatus, 'Anulada');
  assert.equal(res.body.length, 2);
});
