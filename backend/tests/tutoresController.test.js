const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/tutoresController');

const db = {
  query: async () => {
    throw new Error('Consulta no configurada para la prueba');
  },
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
const {
  listarTutoresConPacientes,
  eliminarTutor,
} = require(controllerPath);

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

test('agrupa las mascotas activas dentro de cada tutor', async () => {
  db.query = async () => [[
    {
      tutor_id: 1,
      primer_nombre: 'Ana',
      segundo_nombre: null,
      primer_apellido: 'Pérez',
      segundo_apellido: null,
      nombre_completo: 'Ana Pérez',
      telefono: '55551234',
      correo: 'ana@example.com',
      direccion: 'Ciudad',
      paciente_id: 10,
      nombre_mascota: 'Luna',
      especie: 'Canino',
      raza: 'Mestizo',
    },
    {
      tutor_id: 1,
      primer_nombre: 'Ana',
      segundo_nombre: null,
      primer_apellido: 'Pérez',
      segundo_apellido: null,
      nombre_completo: 'Ana Pérez',
      telefono: '55551234',
      correo: 'ana@example.com',
      direccion: 'Ciudad',
      paciente_id: 11,
      nombre_mascota: 'Milo',
      especie: 'Felino',
      raza: null,
    },
  ]];

  const res = createResponse();
  await listarTutoresConPacientes({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].nombre_completo, 'Ana Pérez');
  assert.deepEqual(res.body[0].mascotas, [
    { id: '10', nombre: 'Luna', especie: 'Canino', raza: 'Mestizo' },
    { id: '11', nombre: 'Milo', especie: 'Felino', raza: '' },
  ]);
});

const createDeleteConnection = (activePatients) => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes('FROM tutor')) {
        return [[{ tutor_id: 1 }]];
      }
      if (sql.includes('COUNT(*) AS total')) {
        return [[{ total: activePatients }]];
      }
      if (sql.includes('UPDATE tutor')) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Consulta no configurada: ${sql}`);
    },
  };

  return { calls, connection };
};

test('impide eliminar un tutor con mascotas activas', async () => {
  const { calls, connection } = createDeleteConnection(2);
  db.getConnection = async () => connection;

  const res = createResponse();
  await eliminarTutor({ params: { id: '1' } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /tiene 2 mascotas activas/);
  assert.equal(
    calls.some(
      (call) => typeof call === 'object' && call.sql.includes('UPDATE tutor')
    ),
    false
  );
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});

test('da de baja lógica a un tutor sin mascotas activas', async () => {
  const { calls, connection } = createDeleteConnection(0);
  db.getConnection = async () => connection;

  const res = createResponse();
  await eliminarTutor({ params: { id: '1' } }, res);

  const update = calls.find(
    (call) => typeof call === 'object' && call.sql.includes('UPDATE tutor')
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Tutor eliminado correctamente');
  assert.match(update.sql, /SET activo = 0/);
  assert.deepEqual(update.values, ['1']);
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});
