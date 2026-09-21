const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const middlewarePath = require.resolve('../src/middleware/permissionMiddleware');

const db = { query: async () => [[]] };

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: db,
};
delete require.cache[middlewarePath];
const { verificarPermiso } = require(middlewarePath);

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

test('consulta en la BD la accion solicitada para el usuario y el modulo', async () => {
  let queryCall;
  db.query = async (sql, values) => {
    queryCall = { sql, values };
    return [[{ permitido: 1 }]];
  };
  let continued = false;

  await verificarPermiso('appointments', 'eliminar')(
    { user: { id: 24 } },
    createResponse(),
    () => {
      continued = true;
    }
  );

  assert.equal(continued, true);
  assert.match(queryCall.sql, /rp\.puede_eliminar AS permitido/);
  assert.deepEqual(queryCall.values, [24, 'appointments']);
});

test('responde 403 cuando rol_permisos niega la accion', async () => {
  db.query = async () => [[{ permitido: 0 }]];
  const res = createResponse();
  let continued = false;

  await verificarPermiso('inventory', 'editar')(
    { user: { id: 9 } },
    res,
    () => {
      continued = true;
    }
  );

  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /No tiene permisos/);
});

test('responde 403 si no existe un permiso activo para el rol', async () => {
  db.query = async () => [[]];
  const res = createResponse();

  await verificarPermiso('users', 'ver')(
    { user: { id: 5 } },
    res,
    () => assert.fail('No debe continuar sin un permiso en la BD')
  );

  assert.equal(res.statusCode, 403);
});
