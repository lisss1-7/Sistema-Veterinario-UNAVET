const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const transport = require('../src/utils/groomingTransport');

test('normaliza el domicilio sin confundir apartamentos distintos', () => {
  assert.equal(transport.normalizeAddress('  CASA Uno,   Zona 1 '), transport.normalizeAddress('casa uno, zona 1'));
  assert.notEqual(transport.normalizeAddress('Casa 1, apartamento 2'), transport.normalizeAddress('Casa 1, apartamento 3'));
});

test('valida importes sin convertir campos vacíos, negativos o infinitos en costos gratuitos', () => {
  assert.equal(transport.money(0), 0); assert.equal(transport.money('25.50'), 25.5);
  for (const value of ['', ' ', false, [], undefined, null, -1, Infinity, 'abc', 100000000]) assert.throws(() => transport.money(value));
});

test('sin migración conserva los objetos históricos y rechaza guardar información que se perdería', async () => {
  const old = [{ id: '1', transportCost: 25 }];
  const result = await transport.enrichAppointments({ query: async () => [[{ grooming_operations_tables: 0 }]] }, old);
  assert.equal(result, old);
  assert.throws(() => transport.requireOperations(false), { statusCode: 503, code: 'GROOMING_MIGRATION_REQUIRED' });
});

test('con las tablas nuevas una cita anterior sin metadatos conserva su respuesta exacta', async () => {
  const old = { id: '1', date: '2025-01-01', transportCost: 25 };
  const result = await transport.enrichAppointments({ query: async sql => sql.includes('grooming_operations_tables') ? [[{ grooming_operations_tables: 2 }]] : [[]] }, [old]);
  assert.equal(result[0], old);
});

test('reutiliza el catálogo y permite conservar un medio retirado únicamente en su cita original', async () => {
  const calls = [];
  const connection = { query: async (sql, values) => { calls.push({ sql, values }); return [[{ forma_pago_id: 7 }]]; } };
  assert.equal(await transport.paymentId(connection, undefined, 7), 7);
  assert.equal(calls.length, 0);
  assert.equal(await transport.paymentId(connection, 'tarjeta', 7), 7);
  assert.deepEqual(calls[0].values, ['tarjeta', 7]);
  assert.match(calls[0].sql, /activo = 1 OR forma_pago_id = \?/);
  await assert.rejects(transport.paymentId({ query: async () => [[]] }, 'inexistente'), { code: 'INVALID_PAYMENT_METHOD' });
});

test('la reserva bloquea los horarios en orden estable sin cambiar su configuración', async () => {
  const calls = [];
  await transport.lockTransportSchedules({ query: async sql => { calls.push(sql); return [[]]; } });
  assert.equal(calls.length, 1); assert.match(calls[0], /ORDER BY h.horario_id FOR UPDATE/);
  assert.doesNotMatch(calls[0], /UPDATE horario_atencion|INSERT|DELETE/);
});

test('la migración solo añade tablas auxiliares y el módulo no escribe ventas ni cobros', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/groomingTransportMigration.sql'), 'utf8').replace(/^--.*$/gm, '');
  assert.equal((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 2);
  assert.doesNotMatch(migration, /\b(?:ALTER|UPDATE|DELETE|DROP|INSERT)\b(?! CASCADE)/);
  assert.match(migration, /UNIQUE KEY uq_grooming_ruta/);
  assert.match(migration, /REFERENCES cita_grooming\(grooming_id\) ON DELETE CASCADE/);
  for (const name of ['groomingTransport.js', '../controllers/groomingController.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils', name), 'utf8');
    assert.doesNotMatch(source, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:cierre_venta|venta_pago)\b/i);
  }
});
