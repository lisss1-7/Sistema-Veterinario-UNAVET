const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const db = { query: async () => { throw new Error('Consulta no configurada'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { marcarPacienteFallecido, listarPacientes, obtenerPacientePorId } = require('../src/controllers/pacientesController');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('marca la mascota sin darla de baja y conserva la fecha al repetir la operación', async () => {
  let deceasedAt = null;
  const calls = [];
  db.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('UPDATE')) {
      assert.match(sql, /fallecido_en IS NULL/);
      assert.match(sql, /activo = 1/);
      assert.doesNotMatch(sql, /SET activo|DELETE/);
      deceasedAt ||= '2026-10-03 12:00:00';
      return [{ affectedRows: 1 }];
    }
    return [[{ fallecido_en: deceasedAt }]];
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = response();
    await marcarPacienteFallecido({ params: { id: '42' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isDeceased, true);
    assert.equal(res.body.deceasedAt, '2026-10-03 12:00:00');
  }
  assert.ok(calls.every(({ values }) => values[0] === '42'));
});

test('no marca pacientes inexistentes ni dados de baja', async () => {
  db.query = async (sql) => sql.startsWith('UPDATE') ? [{ affectedRows: 0 }] : [[]];
  const res = response();
  await marcarPacienteFallecido({ params: { id: '42' } }, res);
  assert.equal(res.statusCode, 404);
});

test('rechaza identificadores inválidos antes de consultar MySQL', async () => {
  db.query = async () => { throw new Error('No debe consultar'); };
  for (const id of ['0', '-1', 'abc', '1 OR 1=1']) {
    const res = response();
    await marcarPacienteFallecido({ params: { id } }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('el listado y el expediente conservan los pacientes fallecidos e informan su estado', async () => {
  db.query = async (sql) => {
    assert.match(sql, /p\.fallecido_en/);
    assert.doesNotMatch(sql, /fallecido_en IS NULL/);
    return [[{ paciente_id: 42, nombre_mascota: 'Luna', fallecido_en: '2026-10-03 12:00:00' }]];
  };
  const list = response();
  await listarPacientes({}, list);
  assert.equal(list.body[0].isDeceased, true);
  assert.equal(list.body[0].id, '42');
  const detail = response();
  await obtenerPacientePorId({ params: { id: '42' } }, detail);
  assert.equal(detail.body.isDeceased, true);
  assert.equal(detail.body.deceasedAt, '2026-10-03 12:00:00');
});
