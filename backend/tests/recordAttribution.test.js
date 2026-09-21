const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/citasController');

const db = {
  query: async () => [[]],
  getConnection: async () => {
    throw new Error('Conexión no configurada para la prueba');
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: db,
};
delete require.cache[controllerPath];
const { listarCitas } = require(controllerPath);

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('el listado de citas incluye al usuario que agendó cada registro', async () => {
  let executedSql = '';
  db.query = async (sql) => {
    executedSql = sql;
    return [[{
      cita_id: 15,
      paciente_id: 4,
      nombre_mascota: 'Luna',
      nombre_tutor: 'Ana López',
      telefono_tutor: '55555555',
      fecha: '2026-09-16',
      hora: '09:30:00',
      motivo: 'Control',
      estado: 'Confirmada',
      creado_por: 3,
      creado_por_nombre: 'María Pérez',
    }]];
  };

  const res = createResponse();
  await listarCitas({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].createdBy, '3');
  assert.equal(res.body[0].createdByName, 'María Pérez');
  assert.match(executedSql, /LEFT JOIN usuarios creador/);
  assert.match(executedSql, /c\.creado_por/);
});
