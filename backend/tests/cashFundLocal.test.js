const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MySQL local: fondo separado en registros, turnos y cierre diario', {
  skip: process.env.UNAVET_TEST_LOCAL_MYSQL !== 'true',
  timeout: 30000,
}, async () => {
  const settings = { ...require('dotenv').parse(fs.readFileSync(process.env.UNAVET_TEST_ENV_FILE || path.join(__dirname, '../.env'))), ...process.env };
  assert(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST), 'La prueba solo admite MySQL local');
  Object.assign(process.env, settings);
  delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
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
    // Simular exactamente la ausencia de las cuatro columnas en produccion.
    await connection.query('ALTER TABLE cierre_venta DROP COLUMN anulada, DROP COLUMN motivo_anulacion, DROP COLUMN anulada_por, DROP COLUMN anulada_en');
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
    const historicalDate = '2000-01-01', date = '2000-02-20';
    const fundItem = amount => ({ type: 'Servicio', serviceId: cashService.servicio_id, description: 'Consulta falsa del cliente', quantity: 1, unitPrice: amount });
    const clinicItem = amount => ({ type: 'Servicio', serviceId: clinicService.servicio_id, quantity: 1, unitPrice: amount });
    const call = async (handler, request = {}, expected = 200) => {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ query: { fecha: date }, params: {}, user: { id: user.usuario_id }, ...request }, res);
      assert.equal(res.statusCode, expected, res.body?.message);
      return res.body;
    };
    const create = (items, payment = cash, selectedDate = date) => call(controller.crearVenta, { body: { date: selectedDate, paymentMethod: payment.codigo, items } }, 201);
    const original = { saleCount: 1, total: 100, productQuantity: 0, payments: [{ code: cash.codigo, name: 'Efectivo', amount: 100 }] };
    const saveLegacy = async (selectedDate, number, after, through) => connection.query(`INSERT INTO cierre_venta_turno
      (fecha, numero, desde_venta_id, hasta_venta_id, finalizado_por, resumen) VALUES (?, ?, ?, ?, ?, ?)`,
      [selectedDate, number, after, through, user.usuario_id, JSON.stringify(original)]);
    let previousId = '0';
    // 42 snapshots sinteticos originales; ninguno se actualiza para activar el parche.
    for (let i = 1; i <= 41; i++) {
      const receipt = await create([fundItem(100)], cash, historicalDate);
      await saveLegacy(historicalDate, i, previousId, receipt.id);
      previousId = receipt.id;
    }
    await connection.query('UPDATE cierre_venta_dia SET finalizado = 1 WHERE fecha = ?', [historicalDate]);
    const legacyClosed = await create([fundItem(100)]);
    await saveLegacy(date, 1, '0', legacyClosed.id);
    const legacyPending = await create([fundItem(100)]);
    const cutoff = legacyPending.id;
    const historicalRows = async () => {
      const result = {};
      for (const table of ['cierre_venta', 'cierre_venta_detalle', 'venta_pago', 'cierre_venta_turno']) {
        const idColumn = table === 'cierre_venta_turno' ? 'turno_id' : table === 'cierre_venta_detalle' ? 'detalle_id' : table === 'venta_pago' ? 'venta_pago_id' : 'venta_id';
        const filter = table === 'cierre_venta_turno' ? 'turno_id <= 42' : 'venta_id <= ?';
        const [rows] = await connection.query(`SELECT * FROM ${table} WHERE ${filter} ORDER BY ${idColumn}`, table === 'cierre_venta_turno' ? [] : [cutoff]);
        result[table] = rows;
      }
      return JSON.stringify(result);
    };
    const storedBefore = await historicalRows();
    const oldApiBefore = await call(controller.listarVentas, { query: { fecha: historicalDate } });
    const mixedApiBefore = await call(controller.listarVentas);
    assert.equal((await call(controller.listarTurnos, { query: { fecha: historicalDate } })).shifts.length, 41);

    process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = cutoff;
    const fund = await create([fundItem(100)]);
    await create([clinicItem(75)]);
    const mixed = await create([fundItem(20), clinicItem(30)], other);
    await connection.query('UPDATE venta_pago SET monto = 30 WHERE venta_id = ?', [mixed.id]);
    await connection.query('INSERT INTO venta_pago (venta_id, forma_pago_id, monto) VALUES (?, ?, ?)', [mixed.id, cash.forma_pago_id, 20]);
    const [product] = await connection.query('INSERT INTO cierre_venta (fecha, usuario_id) VALUES (?, ?)', [date, user.usuario_id]);
    await connection.query('INSERT INTO cierre_venta_detalle (venta_id, tipo, descripcion, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)', [product.insertId, 'Producto', 'Caja', 2, 5]);
    await connection.query('INSERT INTO venta_pago (venta_id, forma_pago_id, monto) VALUES (?, ?, ?)', [product.insertId, cash.forma_pago_id, 10]);
    const deleted = await create([fundItem(999)]);
    await call(controller.eliminarVenta, { params: { id: deleted.id } }); // DELETE de AWS, sin motivo obligatorio.
    const [[remaining]] = await connection.query('SELECT COUNT(*) AS total FROM cierre_venta WHERE venta_id = ?', [deleted.id]);
    assert.equal(remaining.total, 0);

    const sales = await call(controller.listarVentas);
    assert.deepEqual(sales.filter(sale => BigInt(sale.id) <= BigInt(cutoff)), mixedApiBefore);
    assert.deepEqual(await call(controller.listarVentas, { query: { fecha: historicalDate } }), oldApiBefore);
    const fundRecord = sales.find(sale => sale.id === fund.id);
    assert.equal(fundRecord.total, 100);
    assert.equal(fundRecord.accountingVersion, 2);
    assert.equal(fundRecord.cashFundTotal, 100);
    assert.equal(fundRecord.hasSales, false);
    assert.equal(fundRecord.items[0].description, 'Caja');
    assert.equal(fundRecord.payments[0].cashFundAmount, 100);
    assert.equal(sales.find(sale => sale.id === mixed.id).payments.find(payment => payment.code === 'efectivo').cashFundAmount, 8);
    assert.equal(sales.find(sale => sale.id === String(product.insertId)).cashFundTotal, 0);

    const first = await call(controller.finalizarTurno, { body: { date, number: 2, label: 'Nuevo con pendientes anteriores' } }, 201);
    const expected = { accountingVersion: 2, accountingStartAfterSaleId: cutoff, saleCount: 4, total: 215,
      cashFundTotal: 120, receivedTotal: 335, productQuantity: 2, payments: [] };
    assert.deepEqual({ ...first.shift.summary, payments: [] }, expected);
    assert.equal(first.shift.summary.payments.find(payment => payment.code === cash.codigo).amount, 197);
    assert.equal(first.shift.summary.payments.find(payment => payment.code === other.codigo).amount, 18);
    delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID; // El JSON conserva la activacion tras reinicio.
    assert.deepEqual(await call(controller.listarVentas), sales);
    await create([fundItem(60)]);
    const second = await call(controller.finalizarTurno, { body: { date, number: 3 } }, 201);
    assert.deepEqual(second.shift.summary, { accountingVersion: 2, accountingStartAfterSaleId: cutoff,
      saleCount: 0, total: 0, cashFundTotal: 60, receivedTotal: 60, productQuantity: 0, payments: [] });
    await create([clinicItem(0)]);
    await call(controller.finalizarDia, { body: { date } });
    const { shifts } = await call(controller.listarTurnos);
    assert.equal(shifts.length, 4);
    assert.deepEqual(shifts[0].summary, original);
    assert.deepEqual(shifts[1].summary, first.shift.summary);
    assert.equal(shifts[3].summary.accountingVersion, 2);
    assert.equal(shifts[3].summary.total, 0);
    await call(controller.crearVenta, { body: { date, paymentMethod: cash.codigo, items: [fundItem(10)] } }, 409);
    await call(controller.eliminarVenta, { params: { id: fund.id } }, 409);
    await call(controller.finalizarDia, { body: { date: historicalDate } }); // Idempotencia del cierre antiguo.
    assert.equal(await historicalRows(), storedBefore, '42 snapshots y todos los comprobantes antiguos deben permanecer identicos');
    assert.deepEqual(await call(controller.listarVentas, { query: { fecha: historicalDate } }), oldApiBefore);
  } finally {
    delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await connection.rollback();
    connection.release();
    await pool.end();
  }
});
