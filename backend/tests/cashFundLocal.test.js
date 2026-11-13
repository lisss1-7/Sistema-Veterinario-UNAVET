const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MySQL local: fondo separado en registros, turnos y cierre diario', {
  skip: process.env.UNAVET_TEST_LOCAL_MYSQL !== 'true',
  timeout: 30000,
}, async () => {
  const settings = { ...require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env'))), ...process.env };
  assert(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST), 'La prueba solo admite MySQL local');
  const pool = require('../src/config/db');
  const connection = await pool.getConnection();
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  try {
    // Las escrituras se realizan únicamente en tablas temporales de esta sesión.
    for (const table of ['cierre_venta', 'cierre_venta_detalle', 'venta_pago', 'cierre_venta_dia', 'venta_detalle_lote']) {
      await connection.query(`CREATE TEMPORARY TABLE cash_fund_test_${table} LIKE ${table}`);
      await connection.query(`ALTER TABLE cash_fund_test_${table} RENAME TO ${table}`);
    }
    await connection.query(`CREATE TEMPORARY TABLE cierre_venta_turno (
      turno_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      fecha DATE NOT NULL, numero INT UNSIGNED NOT NULL, nombre VARCHAR(80) NULL,
      desde_venta_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      hasta_venta_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      finalizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finalizado_por BIGINT UNSIGNED NULL, resumen JSON NOT NULL,
      UNIQUE KEY (fecha, numero)
    ) ENGINE=InnoDB`);
    await connection.beginTransaction();
    const adapter = {
      query: (...args) => connection.query(...args),
      beginTransaction: () => connection.query('SAVEPOINT cash_fund_request'),
      commit: () => connection.query('RELEASE SAVEPOINT cash_fund_request'),
      rollback: () => connection.query('ROLLBACK TO SAVEPOINT cash_fund_request'),
      release() {},
    };
    pool.query = adapter.query;
    pool.getConnection = async () => adapter;
    const controller = require('../src/controllers/cierreVentasController');
    const [[cashService]] = await connection.query('SELECT servicio_id FROM servicio WHERE nombre = ? AND activo = 1', ['Caja']);
    const [[clinicService]] = await connection.query('SELECT servicio_id FROM servicio WHERE nombre = ? AND activo = 1', ['Consulta']);
    const [methods] = await connection.query('SELECT forma_pago_id, codigo FROM forma_pago WHERE activo = 1 ORDER BY orden, forma_pago_id');
    const cash = methods.find(method => method.codigo === 'efectivo');
    const other = methods.find(method => method.codigo !== 'efectivo');
    const [[user]] = await connection.query('SELECT usuario_id FROM usuario LIMIT 1');
    assert(cashService && clinicService && cash && other && user, 'Se requieren los catálogos locales existentes');
    const date = '2000-01-01';
    const call = async (handler, request = {}, expected = 200) => {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ query: { fecha: date }, params: {}, user: { id: user.usuario_id }, ...request }, res);
      assert.equal(res.statusCode, expected, res.body?.message);
      return res.body;
    };
    const fundItem = amount => ({ type: 'Servicio', serviceId: cashService.servicio_id, description: 'Consulta falsa del cliente', quantity: 1, unitPrice: amount });
    const clinicItem = amount => ({ type: 'Servicio', serviceId: clinicService.servicio_id, quantity: 1, unitPrice: amount });
    const create = (items, payment = cash) => call(controller.crearVenta, { body: { date, paymentMethod: payment.codigo, items, cashFundTotal: 0, hasSales: true } }, 201);
    const fund = await create([fundItem(100)]);
    await create([clinicItem(75)]);
    const mixed = await create([fundItem(20), clinicItem(30)], other);
    // Comprobante histórico con dos formas de pago.
    await connection.query('UPDATE venta_pago SET monto = 30 WHERE venta_id = ?', [mixed.id]);
    await connection.query('INSERT INTO venta_pago (venta_id, forma_pago_id, monto) VALUES (?, ?, ?)', [mixed.id, cash.forma_pago_id, 20]);
    // Un producto llamado Caja sigue siendo una venta; no altera stock real.
    const [product] = await connection.query('INSERT INTO cierre_venta (fecha, usuario_id) VALUES (?, ?)', [date, user.usuario_id]);
    await connection.query('INSERT INTO cierre_venta_detalle (venta_id, tipo, descripcion, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)', [product.insertId, 'Producto', 'Caja', 2, 5]);
    await connection.query('INSERT INTO venta_pago (venta_id, forma_pago_id, monto) VALUES (?, ?, ?)', [product.insertId, cash.forma_pago_id, 10]);
    const canceled = await create([fundItem(999)]);
    await call(controller.eliminarVenta, { params: { id: canceled.id }, body: { reason: 'Prueba de anulación' } });

    const sales = await call(controller.listarVentas);
    const fundRecord = sales.find(sale => sale.id === fund.id);
    assert.equal(fundRecord.total, 100);
    assert.equal(fundRecord.cashFundTotal, 100);
    assert.equal(fundRecord.hasSales, false);
    assert.equal(fundRecord.items[0].description, 'Caja');
    assert.equal(fundRecord.payments[0].cashFundAmount, 100);
    const mixedRecord = sales.find(sale => sale.id === mixed.id);
    assert.equal(mixedRecord.cashFundTotal, 20);
    assert.equal(mixedRecord.hasSales, true);
    assert.equal(mixedRecord.payments.find(payment => payment.code === 'efectivo').cashFundAmount, 8);
    assert.equal(sales.find(sale => sale.id === String(product.insertId)).cashFundTotal, 0);
    assert.equal(sales.find(sale => sale.id === canceled.id).canceled, true);

    const first = await call(controller.finalizarTurno, { body: { date, number: 1, label: 'Prueba fondo y ventas' } }, 201);
    assert.deepEqual({ ...first.shift.summary, payments: [] }, { saleCount: 3, total: 115, cashFundTotal: 120, receivedTotal: 235, productQuantity: 2, payments: [] });
    assert.equal(first.shift.summary.payments.find(payment => payment.code === cash.codigo).amount, 97);
    assert.equal(first.shift.summary.payments.find(payment => payment.code === other.codigo).amount, 18);
    assert.equal((await call(controller.obtenerEstadoDia)).isClosed, false);

    await create([fundItem(60)]);
    const second = await call(controller.finalizarTurno, { body: { date, number: 2 } }, 201);
    assert.deepEqual(second.shift.summary, { saleCount: 0, total: 0, cashFundTotal: 60, receivedTotal: 60, productQuantity: 0, payments: [] });
    await create([clinicItem(0)]);
    await call(controller.finalizarDia, { body: { date } });
    const { shifts } = await call(controller.listarTurnos);
    assert.equal(shifts.length, 3);
    assert.deepEqual(shifts[0].summary, first.shift.summary);
    assert.deepEqual(shifts[2].summary, { saleCount: 1, total: 0, cashFundTotal: 0, receivedTotal: 0, productQuantity: 0, payments: [{ code: cash.codigo, name: 'Efectivo', amount: 0 }] });
    await call(controller.crearVenta, { body: { date, paymentMethod: cash.codigo, items: [fundItem(10)] } }, 409);
    await call(controller.eliminarVenta, { params: { id: fund.id }, body: { reason: 'Día finalizado' } }, 409);
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await connection.rollback();
    connection.release();
    await pool.end();
  }
});
