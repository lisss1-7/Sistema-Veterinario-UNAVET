const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dbPath = require.resolve('../src/config/db');
const calls = [];
let rows = [], failure = false;
const db = { query: async (...args) => { calls.push(args); if (failure) throw new Error('db unavailable'); return [rows]; } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { verificarAdminInventario, consultarAccesoOperaciones } = require('../src/middleware/inventoryOperationsAccess');
const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, set(k,v) { this.headers[k]=v; }, json(body) { this.body = body; return this; } });

test('solo permite la cuenta admin resuelta por ID en MySQL, conservando el permiso del módulo', async () => {
  rows = [{ usuario_id: 10 }]; calls.length = 0;
  let next = 0;
  await verificarAdminInventario({ user: { id: 10 } }, response(), () => next++);
  assert.equal(next, 1);
  assert.deepEqual(calls[0][1], [10, 'admin']);
  assert.match(calls[0][0], /BINARY u.correo = BINARY \?/);
  assert.match(calls[0][0], /eliminado_en IS NULL/);
  assert.match(calls[0][0], /permite_acceso = 1/);
});

test('otro administrador o un nombre falsificado no concede acceso', async () => {
  rows = [];
  for (const user of [{ id: 2, correo: 'admin', rol: 'Administrador' }, { id: 3 }, undefined]) {
    const res = response();
    await verificarAdminInventario({ user }, res, () => assert.fail('No debe autorizar'));
    assert.equal(res.statusCode, 403);
  }
});

test('la capacidad de UI no se almacena en caché y falla cerrada', async () => {
  rows = [{ usuario_id: 10 }];
  let res = response(); await consultarAccesoOperaciones({ user: { id: 10 } }, res);
  assert.deepEqual(res.body, { canAccessOperations: true });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  rows = []; res = response(); await consultarAccesoOperaciones({ user: { id: 2 } }, res);
  assert.deepEqual(res.body, { canAccessOperations: false });
  failure = true; res = response();
  await verificarAdminInventario({ user: { id: 10 } }, res, () => assert.fail());
  assert.equal(res.statusCode, 500);
  res = response(); await consultarAccesoOperaciones({ user: { id: 10 } }, res);
  assert.equal(res.statusCode, 500); failure = false;
});

test('protege todos los métodos privados incluso mediante llamadas directas', () => {
  const router = require('../src/routes/inventarioRoutes');
  for (const layer of router.stack.filter(layer => layer.route)) {
    const route = layer.route;
    if (/^\/(proveedores|compras|movimientos)(\/|$)/.test(route.path)) {
      assert.ok(route.stack.some(s => s.handle.name === 'verificarToken'));
      assert.ok(route.stack.some(s => s.handle.permission?.moduleCode === 'inventory'));
      assert.ok(route.stack.some(s => s.handle === verificarAdminInventario), route.path);
    } else {
      assert.ok(!route.stack.some(s => s.handle === verificarAdminInventario), route.path);
    }
  }
});

test('SQL exclusivo de compras: dos tablas, sin alterar Caja ni datos históricos', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../deploy/inventario-admin/compras.sql'), 'utf8');
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 2);
  assert.doesNotMatch(sql, /\b(ALTER|UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b(?! RESTRICT| SET NULL)/i);
  assert.doesNotMatch(sql, /cierre_venta/);
});


test('historial conserva JWT y permisos habituales, con pesta?a fuera de la restricci?n admin', () => {
  const router = require('../src/routes/inventarioRoutes');
  const route = router.stack.find(layer => layer.route?.path === '/historial').route;
  assert.ok(route.stack.some(s => s.handle.name === 'verificarToken'));
  assert.ok(route.stack.some(s => s.handle.permission?.moduleCode === 'inventory'));
  assert.ok(!route.stack.some(s => s.handle === verificarAdminInventario));
  const source = fs.readFileSync(path.join(__dirname, '../../src/app/pages/Inventory.tsx'), 'utf8');
  assert.ok(source.includes("activeSection === 'history' ? ("));
  assert.ok(!source.includes("activeSection === 'history' && canAccessOperations"));
  const privateButtons = source.slice(source.indexOf('{canAccessOperations && (['), source.indexOf('          ))}', source.indexOf('{canAccessOperations && ([')));
  assert.ok(!privateButtons.includes('history'));
});
