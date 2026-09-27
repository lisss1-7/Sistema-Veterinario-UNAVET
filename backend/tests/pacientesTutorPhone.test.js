const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/pacientesController');

const db = {
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
const { crearPaciente } = require(controllerPath);

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

const patientRequest = (tutorPhone) => ({
  body: {
    petName: 'Luna',
    species: 'Canino',
    breed: 'Mestizo',
    age: '2 años',
    sex: 'Hembra',
    reproductiveStatus: 'Esterilizado',
    color: 'Café',
    tutorFirstName: 'María',
    tutorFirstSurname: 'López',
    tutorPhone,
    tutorEmail: 'maria@example.com',
    tutorAddress: 'Ciudad',
  },
});

const createConnection = ({ existingTutor = null } = {}) => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes('FROM especie')) {
        return [[{ especie_id: 1 }]];
      }
      if (sql.includes('FROM raza')) {
        return [[{ raza_id: 2 }]];
      }
      if (sql.includes('FROM sexo')) {
        return [[{ id: 3 }]];
      }
      if (sql.includes('FROM estado_reproductivo')) {
        return [[{ id: 4 }]];
      }
      if (sql.includes('FROM tutor') && sql.includes('WHERE telefono = ?')) {
        return [existingTutor ? [existingTutor] : []];
      }
      if (sql.includes('INSERT INTO tutor')) {
        return [{ insertId: 9 }];
      }
      if (sql.includes('INSERT INTO paciente')) {
        return [{ insertId: 10 }];
      }

      throw new Error(`Consulta no configurada: ${sql}`);
    },
  };

  return { calls, connection };
};

test('rechaza un tutor nuevo cuando el teléfono ya pertenece a otro tutor', async () => {
  const { calls, connection } = createConnection({
    existingTutor: {
      tutor_id: 5,
      nombre_completo: 'Ana Pérez',
    },
  });
  db.getConnection = async () => connection;

  const res = createResponse();
  await crearPaciente(patientRequest('55551234'), res);

  const tutorLookup = calls.find(
    (call) => typeof call === 'object' && call.sql.includes('FROM tutor')
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /55551234 ya pertenece al tutor Ana Pérez/);
  assert.deepEqual(tutorLookup.values, ['55551234']);
  assert.doesNotMatch(tutorLookup.sql, /primer_nombre\s*=|primer_apellido\s*=/);
  assert.equal(
    calls.some(
      (call) => typeof call === 'object' && call.sql.includes('INSERT INTO tutor')
    ),
    false
  );
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});

test('permite nombres repetidos cuando el teléfono del tutor es diferente', async () => {
  const { calls, connection } = createConnection();
  db.getConnection = async () => connection;

  const res = createResponse();
  await crearPaciente(patientRequest('55559876'), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, '10');
  assert.equal(
    calls.some(
      (call) => typeof call === 'object' && call.sql.includes('INSERT INTO tutor')
    ),
    true
  );
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});
