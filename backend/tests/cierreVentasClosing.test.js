const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/cierreVentasController');

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

const {
  obtenerEstadoDia,
  finalizarDia,
  crearVenta,
  eliminarVenta,
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

const createConnection = (query) => {
  const calls = [];
  return {
    calls,
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return query(sql, values);
    },
  };
};

test('informa que un día sin registro todavía está abierto', async () => {
  db.query = async () => [[]];
  const res = createResponse();

  await obtenerEstadoDia({ query: { fecha: '2026-09-28' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    date: '2026-09-28',
    isClosed: false,
    closedAt: null,
    closedBy: null,
  });
});

test('finaliza el día y registra al usuario responsable', async () => {
  const connection = createConnection(async (sql) => {
    if (sql.includes('SELECT finalizado')) {
      return [[{ finalizado: 0, finalizado_en: null, finalizado_por: null }]];
    }
    return [{ affectedRows: 1 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();

  await finalizarDia(
    { body: { date: '2026-09-28' }, user: { id: '7' } },
    res
  );

  const update = connection.calls.find(
    (call) => typeof call === 'object' && call.sql.includes('UPDATE cierre_venta_dia')
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.isClosed, true);
  assert.deepEqual(update.values, ['7', '2026-09-28']);
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});

test('impide registrar una venta cuando el día ya está finalizado', async () => {
  const connection = createConnection(async (sql) => {
    if (sql.includes('SELECT finalizado')) {
      return [[{ finalizado: 1 }]];
    }
    return [{ affectedRows: 1 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();

  await crearVenta(
    {
      body: {
        date: '2026-09-28',
        paymentMethod: 'efectivo',
        items: [{ type: 'Servicio', serviceId: '2', quantity: 1, unitPrice: 50 }],
      },
      user: { id: '7' },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /ya fue finalizado/);
  assert.equal(
    connection.calls.some(
      (call) => typeof call === 'object' && call.sql.includes('INSERT INTO cierre_venta (')
    ),
    false
  );
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});

test('impide eliminar una venta cuando su día ya está finalizado', async () => {
  const connection = createConnection(async (sql) => {
    if (sql.includes("DATE_FORMAT(fecha")) {
      return [[{ fecha: '2026-09-28' }]];
    }
    if (sql.includes('SELECT finalizado')) {
      return [[{ finalizado: 1 }]];
    }
    return [{ affectedRows: 1 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();

  await eliminarVenta({ params: { id: '15' }, user: { id: '7' } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /ya fue finalizado/);
  assert.equal(
    connection.calls.some(
      (call) => typeof call === 'object' && call.sql.includes('DELETE FROM cierre_venta')
    ),
    false
  );
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});
