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
  finalizarTurno,
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
    if (sql.includes('SELECT numero')) return [[]];
    if (sql.includes('MAX(venta_id)')) return [[{ hasta_venta_id: 15 }]];
    if (sql.includes('information_schema')) return [[]];
    if (sql.includes('AS sale_count')) return [[{ sale_count: 1, total: 50, product_quantity: 0 }]];
    if (sql.includes('SUM(pago.monto)')) return [[]];
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
  assert.ok(connection.calls.some(call => typeof call === 'object' && call.sql.includes('INSERT INTO cierre_venta_turno')));
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});

test('cerrar turno deja abierto el día y no modifica ventas ni inventario', async () => {
  const connection = createConnection(async sql => {
    if (sql.includes('SELECT finalizado')) return [[{ finalizado: 0 }]];
    if (sql.includes('SELECT numero')) return [[]];
    if (sql.includes('MAX(venta_id)')) return [[{ hasta_venta_id: 15 }]];
    if (sql.includes('information_schema')) return [[]];
    if (sql.includes('AS sale_count')) return [[{ sale_count: 1, total: 50, product_quantity: 2 }]];
    if (sql.includes('SUM(pago.monto)')) return [[{ codigo: 'efectivo', nombre: 'Efectivo', amount: 50 }]];
    return [{ affectedRows: 1, insertId: 3 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();
  await finalizarTurno({ body: { date: '2026-10-13', number: 1, label: 'Mañana' }, user: { id: '7' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.shift.number, 1);
  assert.equal(res.body.shift.summary.total, 50);
  const writes = connection.calls.filter(call => typeof call === 'object' && /^\s*(UPDATE|DELETE|INSERT)/.test(call.sql));
  assert.equal(writes.length, 2); // lock row + immutable shift snapshot
  assert.ok(writes.every(call => /INSERT IGNORE INTO cierre_venta_dia|INSERT INTO cierre_venta_turno/.test(call.sql)));
  assert.deepEqual(connection.calls.filter(call => typeof call === 'string'), ['begin', 'commit', 'release']);
});

test('no permite cerrar turnos de un día finalizado', async () => {
  const connection = createConnection(async sql => sql.includes('SELECT finalizado') ? [[{ finalizado: 1 }]] : [{ affectedRows: 1 }]);
  db.getConnection = async () => connection;
  const res = createResponse();
  await finalizarTurno({ body: { date: '2026-10-13', number: 1 }, user: { id: '7' } }, res);
  assert.equal(res.statusCode, 409);
  assert.ok(!connection.calls.some(call => typeof call === 'object' && call.sql.includes('INSERT INTO cierre_venta_turno')));
  assert.deepEqual(connection.calls.filter(call => typeof call === 'string'), ['begin', 'rollback', 'release']);
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
