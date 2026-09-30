const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const inventoryLotsPath = require.resolve('../src/utils/inventoryLots');
const controllerPath = require.resolve('../src/controllers/inventarioController');

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
require.cache[inventoryLotsPath] = {
  id: inventoryLotsPath,
  filename: inventoryLotsPath,
  loaded: true,
  exports: {
    recordMovement: async () => {},
    consumeLots: async () => {},
    addToPrimaryLot: async () => {},
    setTotalStock: async () => {},
  },
};
delete require.cache[controllerPath];

const { finalizarAuditoria } = require(controllerPath);

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

test('finaliza una auditoría completa y conserva su detalle', async () => {
  const connection = createConnection(async (sql) => {
    if (sql.includes('FROM producto_inventario producto')) {
      return [[{
        producto_id: 4,
        nombre: 'Vacuna múltiple',
        categoria: 'Vacunas',
        unidad_medida: 'dosis',
      }]];
    }
    if (sql.includes('FROM lote_producto')) {
      return [[{ producto_lote_id: 8, producto_id: 4, stock: 12 }]];
    }
    if (sql.includes('INSERT INTO auditoria_inventario (')) {
      return [{ insertId: 21 }];
    }
    if (sql.includes('FROM usuario')) {
      return [[{ nombre: 'Ana López', correo: 'ana@example.com' }]];
    }
    return [{ affectedRows: 1 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();

  await finalizarAuditoria(
    {
      body: {
        auditDate: '2026-09-28',
        startedAt: new Date().toISOString(),
        items: [{ productId: '4', systemStock: 12, physicalStock: 12, notes: '' }],
      },
      user: { id: '7' },
      ip: '127.0.0.1',
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.audit.code, 'AUD-2026-000021');
  assert.equal(res.body.audit.auditDate, '2026-09-28');
  assert.equal(res.body.audit.discrepancies, 0);
  assert.equal(res.body.audit.items[0].difference, 0);
  assert.ok(
    connection.calls.some(
      (call) => typeof call === 'object' && call.sql.includes('INSERT INTO auditoria_inventario_detalle')
    )
  );
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'commit', 'release']
  );
});

test('cancela la auditoría si el stock cambió durante el conteo', async () => {
  const connection = createConnection(async (sql) => {
    if (sql.includes('FROM producto_inventario producto')) {
      return [[{
        producto_id: 4,
        nombre: 'Vacuna múltiple',
        categoria: 'Vacunas',
        unidad_medida: 'dosis',
      }]];
    }
    if (sql.includes('FROM lote_producto')) {
      return [[{ producto_lote_id: 8, producto_id: 4, stock: 11 }]];
    }
    return [{ affectedRows: 1 }];
  });
  db.getConnection = async () => connection;
  const res = createResponse();

  await finalizarAuditoria(
    {
      body: {
        auditDate: '2026-09-28',
        startedAt: new Date().toISOString(),
        items: [{ productId: 4, systemStock: 12, physicalStock: 12, notes: '' }],
      },
      user: { id: '7' },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /cambió durante el conteo/);
  assert.equal(
    connection.calls.some(
      (call) => typeof call === 'object' && call.sql.includes('INSERT INTO auditoria_inventario (')
    ),
    false
  );
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['begin', 'rollback', 'release']
  );
});

test('rechaza conteos incompletos antes de abrir una transacción', async () => {
  const connection = createConnection(async () => [[]]);
  db.getConnection = async () => connection;
  const res = createResponse();

  await finalizarAuditoria(
    {
      body: {
        auditDate: '2026-09-28',
        startedAt: new Date().toISOString(),
        items: [],
      },
      user: { id: '7' },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['release']
  );
});

test('rechaza una fecha de auditoría futura', async () => {
  const connection = createConnection(async () => [[]]);
  db.getConnection = async () => connection;
  const res = createResponse();

  await finalizarAuditoria(
    {
      body: {
        auditDate: '2999-01-01',
        startedAt: new Date().toISOString(),
        items: [{ productId: 4, systemStock: 12, physicalStock: 12, notes: '' }],
      },
      user: { id: '7' },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /fecha válida/);
  assert.deepEqual(
    connection.calls.filter((call) => typeof call === 'string'),
    ['release']
  );
});
