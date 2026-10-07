const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/config/db');
const db = { getConnection: async () => { throw new Error('Conexión no configurada'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { crearGrooming, actualizarGrooming, cambiarEstadoGrooming, eliminarGrooming } =
  require('../src/controllers/groomingController');

const body = {
  patientId: '4', type: 'Grooming en clínica', petName: 'Luna 2',
  animalSize: 'Mediano', age: '3 años', tutorFirstName: 'Ana', tutorFirstSurname: 'López',
  tutorPhone: '55555555', date: '2099-10-05', time: '09:30', groomingCost: 0,
};
const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});
const setup = ({ historyError = false } = {}) => {
  const events = [];
  const connection = {
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    async query(sql, params) {
      if (sql.includes('FROM horario_atencion')) return [[{ enabled: 1 }]];
      if (sql.includes('SELECT grooming_id')) return [[]];
      if (sql.includes('FROM tipo_grooming')) return [[{ tipo_grooming_id: 1, requiere_transporte: 0 }]];
      if (sql.includes('FROM paciente p')) return [[{ tutor_id: 2, edad: '3 años' }]];
      if (sql.includes('FROM tamano_animal')) return [[{ tamano_animal_id: 1 }]];
      if (sql.includes('FROM estado_grooming')) return [[{ estado_grooming_id: 1, nombre: 'Pendiente' }]];
      if (sql.includes('FROM cita_grooming cita')) return [[{
        paciente_id: 4, fecha: body.date, hora: body.time, tipo: body.type,
        estado: 'Pendiente', creado_por: 3,
      }]];
      if (sql.includes('FROM cita_grooming grooming')) return [[{ grooming_id: 12, estado_grooming_id: 1, estado: 'Pendiente' }]];
      if (sql.includes('SELECT historial_id')) return [[]];
      if (sql.includes('INSERT INTO historial_clinico')) {
        if (historyError) throw new Error('Fallo del historial');
        events.push('history');
      } else if (sql.includes('INSERT INTO cita_grooming')) {
        events.push('appointment');
        assert.equal(params[0], '4');
        assert.equal(params[2], 'Luna 2');
        assert.equal(params[16], 0);
      } else if (sql.includes('UPDATE cita_grooming')) events.push('update');
      else if (sql.includes('DELETE FROM historial_clinico')) events.push('deleteHistory');
      else if (sql.includes('DELETE FROM cita_grooming')) events.push('deleteAppointment');
      else throw new Error(`SQL inesperado: ${sql}`);
      return [{ insertId: 12, affectedRows: 1 }];
    },
  };
  db.getConnection = async () => connection;
  return events;
};

test('crea grooming de paciente registrado y su historial en la misma transacción', async () => {
  const events = setup();
  const res = response();
  await crearGrooming({ body, user: { id: 3 } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, '12');
  assert.match(res.body.message, /historial/);
  assert.deepEqual(events, ['begin', 'appointment', 'history', 'commit', 'release']);
});

test('si falla el historial revierte la cita y devuelve un error', async () => {
  const events = setup({ historyError: true });
  const res = response();
  await crearGrooming({ body, user: { id: 3 } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(events, ['begin', 'appointment', 'rollback', 'release']);
});

test('la edición también sincroniza el historial antes de confirmar', async () => {
  const events = setup();
  const res = response();
  await actualizarGrooming({ params: { id: '12' }, body, user: { id: 3 } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(events, ['begin', 'update', 'history', 'commit', 'release']);
});

test('el cambio de estado sincroniza el historial en la misma transacción', async () => {
  const events = setup();
  const res = response();
  await cambiarEstadoGrooming({ params: { id: '12' }, body: { status: 'Pendiente' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(events, ['begin', 'update', 'history', 'commit', 'release']);
});

test('elimina primero el historial pendiente y confirma junto con la cita', async () => {
  const events = setup();
  const res = response();
  await eliminarGrooming({ params: { id: '12' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(events, ['begin', 'deleteHistory', 'deleteAppointment', 'commit', 'release']);
});
