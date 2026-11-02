const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const db = { query: async () => { throw new Error('Consulta no configurada'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { crearProducto, actualizarProducto, eliminarProducto } = require('../src/controllers/inventarioController');
const { listarHistorial } = require('../src/controllers/inventarioHistorialController');
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = () => ({
  params: { id: '19' }, user: { id: '7' }, ip: '127.0.0.1',
  body: {
    name: 'Vacuna', category: 'Vacunas', presentation: 'Dosis', description: 'Descripción',
    minStock: 2, price: 20, currentStock: 0, status: 'Activo', userId: '999',
  },
});
const connection = ({ auditFails = false, missing = false } = {}) => {
  const events = [];
  const result = {
    events,
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    query: async (sql, values) => {
      events.push({ sql, values });
      if (sql.includes('INSERT INTO auditoria ') && auditFails) throw new Error('Auditoría no disponible');
      if (sql.includes('SELECT categoria_id')) return [[{ categoria_id: 1 }]];
      if (sql.includes('SELECT unidad_medida_id')) return [[{ unidad_medida_id: 2 }]];
      if (sql.includes('FROM producto_inventario')) return [missing ? [] : [{ producto_id: 19, nombre: 'Vacuna', activo: 1 }]];
      if (sql.includes('FROM lote_producto')) return [[]];
      return [{ insertId: 19, affectedRows: missing ? 0 : 1 }];
    },
  };
  db.getConnection = async () => result;
  return result;
};

for (const [handler, action, status] of [
  [crearProducto, 'CREAR_PRODUCTO', 201],
  [actualizarProducto, 'EDITAR_PRODUCTO', 200],
  [eliminarProducto, 'INACTIVAR_PRODUCTO', 200],
]) {
  test(`${action}: guarda al usuario autenticado dentro de la transacción del producto`, async () => {
    const conn = connection();
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, status, res.body?.message);
    const audit = conn.events.find((event) => event.sql?.includes('INSERT INTO auditoria '));
    assert.ok(audit);
    assert.deepEqual(audit.values.slice(0, 3), ['7', action, action === 'CREAR_PRODUCTO' ? 19 : '19']);
    assert.equal(audit.values[4], '127.0.0.1');
    assert.ok(conn.events.indexOf(audit) < conn.events.indexOf('commit'));
    assert.deepEqual(conn.events.filter((event) => typeof event === 'string'), ['begin', 'commit', 'release']);
  });

  test(`${action}: revierte el producto si no se puede guardar su responsable`, async () => {
    const conn = connection({ auditFails: true });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(conn.events.filter((event) => typeof event === 'string'), ['begin', 'rollback', 'release']);
  });
}

test('no registra cambios de productos inexistentes', async () => {
  for (const handler of [actualizarProducto, eliminarProducto]) {
    const conn = connection({ missing: true });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(conn.events.some((event) => event.sql?.includes('INSERT INTO auditoria ')), false);
    assert.deepEqual(conn.events.filter((event) => typeof event === 'string'), ['begin', 'rollback', 'release']);
  }
});

test('rechaza fechas, acciones, identificadores y páginas inválidas antes de consultar', async () => {
  db.query = async () => assert.fail('No debe consultar con filtros inválidos');
  for (const query of [
    { from: '2026-02-30' }, { to: 'incorrecta' }, { from: '2026-11-02', to: '2026-11-01' },
    { action: 'LOGIN' }, { action: ['Entrada'] }, { productId: '-1' }, { productId: '1 OR 1=1' },
    { page: '0' }, { page: '9007199254740991' }, { page: ['1'] },
  ]) {
    const res = response();
    await listarHistorial({ query }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
});

test('consulta productos y movimientos con filtros parametrizados y límites de fecha de Guatemala', async () => {
  const calls = [];
  const timestamp = Date.parse('2026-11-02T06:30:00Z');
  db.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT COUNT')) return [[{ total: 51 }]];
    return [[
      { origen: 'producto', evento_id: 3, producto_id: 19, producto: 'Vacuna', fecha_ms: timestamp, accion: 'EDITAR_PRODUCTO', responsable: 'Ana López', descripcion: 'Producto editado' },
      { origen: 'movimiento', evento_id: 3, producto_id: 19, producto: 'Vacuna', fecha_ms: timestamp, accion: 'Entrada', responsable: '', cantidad: 5, stock_anterior: 0, stock_nuevo: 5 },
    ]];
  };
  const res = response();
  await listarHistorial({ query: { productId: '19', from: '2026-11-02', to: '2026-11-02', page: '2' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls[0].values, [19, Date.parse('2026-11-02T06:00:00Z'), Date.parse('2026-11-03T06:00:00Z')]);
  assert.deepEqual(calls[1].values, [...calls[0].values, 50]);
  assert.match(calls[1].sql, /UNION ALL/);
  assert.equal(res.body.total, 51);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.items[0].date, '2026-11-02T06:30:00.000Z');
  assert.equal(res.body.items[0].quantity, null);
  assert.equal(res.body.items[1].responsible, 'Sin responsable registrado');
  assert.equal(res.body.items[1].quantity, 5);
  assert.notEqual(res.body.items[0].id, res.body.items[1].id);
});

test('permite consultar únicamente las ediciones y conserva el error de acceso a datos como respuesta controlada', async () => {
  db.query = async (_sql, values) => {
    assert.equal(values[0], 'EDITAR_PRODUCTO');
    throw new Error('detalle privado');
  };
  const res = response();
  await listarHistorial({ query: { action: 'EDITAR_PRODUCTO' } }, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /detalle privado/);
});
