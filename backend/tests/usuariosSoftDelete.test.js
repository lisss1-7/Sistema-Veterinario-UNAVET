const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/usuariosController');

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
  eliminarUsuario,
  listarUsuarios,
  restaurarUsuario,
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

test('lista únicamente usuarios que no tienen borrado lógico', async () => {
  let querySql = '';
  db.query = async (sql) => {
    querySql = sql;
    return [[]];
  };

  const res = createResponse();
  await listarUsuarios({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.match(querySql, /u\.eliminado_en IS NULL/);
});

test('incluye usuarios dados de baja cuando el módulo lo solicita', async () => {
  let querySql = '';
  let queryValues = [];
  db.query = async (sql, values) => {
    querySql = sql;
    queryValues = values;
    return [[]];
  };

  const res = createResponse();
  await listarUsuarios({ query: { includeDeleted: 'true' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.match(querySql, /\? = 1 OR u\.eliminado_en IS NULL/);
  assert.deepEqual(queryValues, [1]);
});

test('elimina un usuario con una marca lógica y conserva su registro', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes('FROM estado_usuario')) {
        return [[{ estado_usuario_id: 2 }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  db.getConnection = async () => connection;

  const res = createResponse();
  await eliminarUsuario(
    { params: { id: '8' }, user: { id: '1' } },
    res
  );

  const userUpdate = calls.find(
    (call) => typeof call === 'object' && call.sql.includes('UPDATE usuario')
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Usuario dado de baja correctamente');
  assert.match(userUpdate.sql, /eliminado_en = NOW\(\)/);
  assert.match(userUpdate.sql, /eliminado_en IS NULL/);
  assert.deepEqual(userUpdate.values, [2, '8']);
  assert.equal(
    calls.some(
      (call) => typeof call === 'object' && /DELETE FROM usuario/i.test(call.sql)
    ),
    false
  );
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});

test('no elimina lógicamente si no existe un estado inactivo configurado', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('FROM estado_usuario')) {
        return [[]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  db.getConnection = async () => connection;

  const res = createResponse();
  await eliminarUsuario(
    { params: { id: '8' }, user: { id: '1' } },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(
    res.body.message,
    'No existe un estado inactivo configurado para el usuario'
  );
  assert.equal(
    calls.some(
      (call) =>
        typeof call === 'object' && call.sql.includes('UPDATE usuario')
    ),
    false
  );
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});

test('restaura un usuario dado de baja y conserva el mismo registro', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes('FROM estado_usuario')) {
        return [[{ estado_usuario_id: 1 }]];
      }
      if (sql.includes('UPDATE usuario')) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM usuario usuario')) {
        return [[{
          usuario_id: 8,
          primer_nombre: 'Ana',
          segundo_nombre: null,
          primer_apellido: 'López',
          segundo_apellido: null,
          rol: 'Administrador',
        }]];
      }
      return [[]];
    },
  };
  db.getConnection = async () => connection;

  const res = createResponse();
  await restaurarUsuario({ params: { id: '8' } }, res);

  const userUpdate = calls.find(
    (call) => typeof call === 'object' && call.sql.includes('UPDATE usuario')
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Usuario restaurado correctamente');
  assert.match(userUpdate.sql, /eliminado_en = NULL/);
  assert.match(userUpdate.sql, /eliminado_en IS NOT NULL/);
  assert.deepEqual(userUpdate.values, [1, '8']);
  assert.deepEqual(
    calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});
