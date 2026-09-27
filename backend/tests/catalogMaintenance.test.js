const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve(
  '../src/controllers/catalogosProcesoPacientesController'
);

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
const controller = require(controllerPath);

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

test('crea servicios con sus campos propios y una categoría activa', async () => {
  const calls = [];
  db.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM categoria_servicio')) {
      return [[{ categoria_servicio_id: 3 }]];
    }
    return [{ insertId: 12, affectedRows: 1 }];
  };

  const res = createResponse();
  await controller.crearCatalogo(
    {
      params: { catalogo: 'servicios' },
      body: {
        nombre: 'Consulta especializada',
        descripcion: 'Consulta clínica',
        categoria_servicio_id: 3,
        precio_base: 175.5,
        controla_inventario: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.match(calls[1].sql, /INSERT INTO servicio/);
  assert.deepEqual(calls[1].values, [
    3,
    'Consulta especializada',
    'Consulta clínica',
    175.5,
    0,
  ]);
});

test('crea un rol y guarda sus permisos dentro de una transacción', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('INSERT INTO rol')) {
        return [{ insertId: 8, affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };
  db.getConnection = async () => connection;

  const res = createResponse();
  await controller.crearCatalogo(
    {
      params: { catalogo: 'roles' },
      body: {
        nombre: 'Recepción',
        permisos: [
          {
            codigo: 'appointments',
            puede_ver: false,
            puede_crear: true,
            puede_editar: false,
            puede_eliminar: false,
          },
        ],
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.slice(0, 2), [
    'begin',
    { sql: 'INSERT INTO rol (nombre) VALUES (?)', values: ['Recepción'] },
  ]);
  const permissionInsert = calls.find(
    (call) => typeof call === 'object' && call.sql.includes('INSERT INTO rol_permiso')
  );
  assert.deepEqual(permissionInsert.values.slice(0, 5), [8, 1, 1, 0, 0]);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

test('actualiza permisos aunque el nombre del rol no cambie', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT rol_id')) return [[{ rol_id: 5 }]];
      if (sql.startsWith('UPDATE rol')) return [{ affectedRows: 0 }];
      return [{ affectedRows: 1 }];
    },
  };
  db.getConnection = async () => connection;

  const res = createResponse();
  await controller.actualizarCatalogo(
    {
      params: { catalogo: 'roles', id: '5' },
      body: {
        nombre: 'Administrador',
        permisos: [
          {
            codigo: 'users',
            puede_ver: true,
            puede_crear: true,
            puede_editar: true,
            puede_eliminar: true,
          },
        ],
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Rol y permisos actualizados correctamente');
  assert.equal(calls.includes('commit'), true);
});

test('impide dar de baja categorías con servicios activos', async () => {
  db.query = async () => [[{ servicio_id: 10 }]];
  const res = createResponse();

  await controller.eliminarCatalogo(
    { params: { catalogo: 'categorias-servicio', id: '4' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /servicios activos/);
});

test('impide dar de baja roles asignados a usuarios', async () => {
  db.query = async () => [[{ usuario_id: 2 }]];
  const res = createResponse();

  await controller.eliminarCatalogo(
    { params: { catalogo: 'roles', id: '2' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /asignado a usuarios/);
});

test('conserva estados de usuario como catálogo interno sin mantenimiento', async () => {
  let queried = false;
  db.query = async () => {
    queried = true;
    return [[]];
  };
  const res = createResponse();

  await controller.crearCatalogo(
    {
      params: { catalogo: 'estados-usuario' },
      body: { nombre: 'Suspendido' },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(queried, false);
});
