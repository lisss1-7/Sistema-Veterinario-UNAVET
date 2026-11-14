const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const localPool = () => {
  const settings = { ...require('dotenv').parse(fs.readFileSync(process.env.UNAVET_TEST_ENV_FILE || path.join(__dirname, '../.env'))), ...process.env };
  assert(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST), 'Solo se admite MySQL local');
  return require('mysql2/promise').createPool(require('../src/config/dbOptions').getDatabaseOptions(settings));
};
const enabled = { skip: process.env.UNAVET_TEST_LOCAL_MYSQL !== 'true', timeout: 30000 };
const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/prescriptionConsultationMigration.sql'), 'utf8').replace(/^--.*$/gm, '').trim();

test('MySQL local: DDL real, JSON, precisión, FK, idempotencia y limpieza aislada', enabled, async () => {
  const pool = localPool(), c = await pool.getConnection();
  const prefix = `ut_rx_${randomBytes(4).toString('hex')}_`;
  assert.match(prefix, /^ut_rx_[a-f0-9]{8}_$/);
  const created = [];
  const query = (sql, args) => c.query(sql.replace(/\b(receta_consulta|receta)\b/g, name => prefix + name)
    .replace('CONSTRAINT fk_receta_consulta_receta', `CONSTRAINT ${prefix}fk`), args);
  try {
    await query('CREATE TABLE receta (receta_id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB'); created.push('receta');
    await query('INSERT INTO receta VALUES (1), (2)');
    await query(migration); created.push('receta_consulta'); await query(migration);
    await query('INSERT INTO receta_consulta VALUES (1, 4.535924, ?)', [JSON.stringify([{ serviceId: '3', unitPrice: 12.34, quantity: 2 }])]);
    const [[row]] = await query('SELECT peso_kg, JSON_LENGTH(procedimientos) AS count FROM receta_consulta WHERE receta_id = 1');
    assert.equal(row.peso_kg, '4.535924'); assert.equal(Number(row.count), 1);
    await assert.rejects(query("INSERT INTO receta_consulta VALUES (999, NULL, '[]')"), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(query('DELETE FROM receta WHERE receta_id = 1'), { code: 'ER_ROW_IS_REFERENCED_2' });
    await assert.rejects(query("INSERT INTO receta_consulta VALUES (2, NULL, 'no es json')"));
  } finally {
    for (const name of created.reverse()) {
      assert(['receta_consulta', 'receta'].includes(name));
      await c.query(`DROP TABLE \`${prefix}${name}\``);
      const [rows] = await c.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [prefix + name]);
      assert.equal(rows.length, 0);
    }
    c.release(); await pool.end();
  }
});

test('MySQL local: recetas, peso kg/lb, procedimientos, snapshots, medicamentos y rollback sin ventas', enabled, async () => {
  const pool = localPool(), c = await pool.getConnection();
  const dbPath = require.resolve('../src/config/db');
  const previousDb = require.cache[dbPath];
  let migrated = false, injectFailure = false;
  const writes = [];
  const adapter = {
    query: (sql, values) => {
      if (sql.includes('prescription_consultation_tables')) return Promise.resolve([[{ prescription_consultation_tables: migrated ? 1 : 0 }]]);
      if (/INSERT|UPDATE|DELETE/.test(sql)) {
        writes.push(sql);
        assert.ok(!/\b(venta|venta_pago|cierre_venta|movimiento_inventario|historial_clinico)\b/.test(sql), 'La receta no debe crear ventas ni movimientos por procedimientos');
      }
      if (injectFailure && sql.includes('INSERT INTO receta_medicamento')) throw new Error('Fallo simulado al guardar medicamento');
      return c.query(sql, values);
    },
    beginTransaction: () => c.beginTransaction(), commit: () => c.commit(), rollback: () => c.rollback(), release: () => {},
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => adapter } };
  const controller = require('../src/controllers/recetasController');
  const res = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const [[user]] = await c.query('SELECT usuario_id FROM usuario LIMIT 1');
    const [[vet]] = await c.query('SELECT veterinario_id FROM veterinario WHERE activo = 1 LIMIT 1');
    const [[mode]] = await c.query('SELECT nombre FROM modo_entrega_receta WHERE activo = 1 AND descuenta_inventario = 0 LIMIT 1');
    assert(user && vet && mode, 'Se requieren catálogos locales de usuario, veterinario y modo externo');
    const [[salesBefore]] = await c.query('SELECT COUNT(*) AS count FROM cierre_venta');
    const [[paymentsBefore]] = await c.query('SELECT COUNT(*) AS count FROM venta_pago');
    // Tablas TEMPORARY ocultan las tablas reales solo en esta conexión.
    for (const table of ['receta', 'receta_medicamento', 'receta_medicamento_lote', 'servicio', 'categoria_servicio']) {
      await c.query(`CREATE TEMPORARY TABLE rx_test_${table} LIKE ${table}`);
      await c.query(`ALTER TABLE rx_test_${table} RENAME TO ${table}`);
    }
    await c.query('CREATE TEMPORARY TABLE paciente (paciente_id BIGINT UNSIGNED PRIMARY KEY, tutor_id BIGINT UNSIGNED, activo TINYINT)');
    await c.query('CREATE TEMPORARY TABLE tutor (tutor_id BIGINT UNSIGNED PRIMARY KEY, primer_nombre VARCHAR(60), segundo_nombre VARCHAR(60), primer_apellido VARCHAR(60), segundo_apellido VARCHAR(60), telefono VARCHAR(20))');
    await c.query(migration.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE').replace(/,\s*CONSTRAINT[^\n]+/, ''));
    await c.query("INSERT INTO paciente VALUES (1, 1, 1), (2, 1, 1)");
    await c.query("INSERT INTO tutor VALUES (1, 'Tutor', NULL, 'Prueba', NULL, '55555555')");
    await c.query("INSERT INTO categoria_servicio (categoria_servicio_id, nombre, activo) VALUES (1, 'Pruebas', 1)");
    await c.query("INSERT INTO servicio (servicio_id, categoria_servicio_id, nombre, descripcion, precio_base, controla_inventario, activo) VALUES (1, 1, 'Servicio A', 'Original A', 123.45, 0, 1), (2, 1, 'Servicio B', 'Original B', 67.89, 0, 1)");
    const medicine = { productName: 'Medicamento externo', quantity: 2, instructions: 'Cada doce horas', deliveryMode: mode.nombre };
    const base = { patientId: '1', reason: 'Control', medications: [medicine] };
    const call = async (fn, body, id) => { const response = res(); await controller[fn]({ body, params: { id }, user: { id: user.usuario_id } }, response); return response; };
    let result = await call('crearReceta', base); assert.equal(result.code, 201);
    const historicalId = result.body.id;
    const historical = await controller.obtenerRecetas(adapter);
    const [[oldRaw]] = await c.query('SELECT * FROM receta WHERE receta_id = ?', [historicalId]);
    migrated = true;
    const before = JSON.stringify(historical);
    assert.equal(JSON.stringify(await controller.obtenerRecetas(adapter)), before);
    result = await call('crearReceta', { ...base, consultationVersion: 1, weight: { value: '10', unit: 'kg' }, procedures: [{ serviceId: '1', quantity: 2 }, { serviceId: '2', quantity: 1 }] });
    assert.equal(result.code, 201); const kgId = result.body.id;
    result = await call('crearReceta', { ...base, consultationVersion: 1, weight: { value: '22.0462262185', unit: 'lb' }, procedures: [] });
    assert.equal(result.code, 201); const lbId = result.body.id;
    let rows = await controller.obtenerRecetas(adapter), kg = rows.find(row => row.id === kgId);
    assert.equal(kg.weightKg, 10); assert.equal(kg.procedureTotal, 314.79); assert.equal(kg.procedures.length, 2);
    assert.equal(kg.medications[0].instructions, medicine.instructions);
    assert.equal(rows.find(row => row.id === lbId).weightKg, 10);
    // Cambios posteriores de paciente/catálogo no reescriben snapshots.
    await c.query("UPDATE servicio SET precio_base = 999, nombre = 'Cambiado', activo = 0 WHERE servicio_id = 1");
    result = await call('crearReceta', { ...base, weight: { value: 20, unit: 'kg' }, procedures: [] });
    assert.equal(result.code, 201);
    kg = (await controller.obtenerRecetas(adapter)).find(row => row.id === kgId);
    assert.equal(kg.weightKg, 10); assert.equal(kg.procedures[0].name, 'Servicio A'); assert.equal(kg.procedureTotal, 314.79);
    result = await call('actualizarReceta', { ...base, veterinarianId: String(vet.veterinario_id), diagnosis: 'Seguimiento' }, kgId);
    assert.equal(result.code, 200);
    kg = (await controller.obtenerRecetas(adapter)).find(row => row.id === kgId);
    assert.equal(kg.weightKg, 10); assert.equal(kg.procedureTotal, 314.79);
    const [[countBefore]] = await c.query('SELECT COUNT(*) AS count FROM receta');
    injectFailure = true;
    result = await call('crearReceta', { ...base, consultationVersion: 1, weight: { value: 2, unit: 'kg' }, procedures: [{ serviceId: '2', quantity: 1 }] });
    injectFailure = false; assert.equal(result.code, 500);
    const [[countAfter]] = await c.query('SELECT COUNT(*) AS count FROM receta'); assert.equal(countAfter.count, countBefore.count);
    const [[orphan]] = await c.query('SELECT COUNT(*) AS count FROM receta_consulta c LEFT JOIN receta r ON r.receta_id = c.receta_id WHERE r.receta_id IS NULL'); assert.equal(Number(orphan.count), 0);
    const savedRecipe = (await controller.obtenerRecetas(adapter)).find(row => row.id === kgId);
    injectFailure = true;
    result = await call('actualizarReceta', { ...base, veterinarianId: String(vet.veterinario_id),
      diagnosis: 'Cambio que debe revertirse', weight: { value: 99, unit: 'kg' }, procedures: [] }, kgId);
    injectFailure = false; assert.equal(result.code, 500);
    assert.deepEqual((await controller.obtenerRecetas(adapter)).find(row => row.id === kgId), savedRecipe);
    result = await call('actualizarReceta', { ...base, veterinarianId: String(vet.veterinario_id), weight: { value: 3, unit: 'kg' } }, historicalId);
    assert.equal(result.code, 400);
    const [[newRaw]] = await c.query('SELECT * FROM receta WHERE receta_id = ?', [historicalId]); assert.deepEqual(newRaw, oldRaw);
    rows = await controller.obtenerRecetas(adapter); assert.deepEqual(rows.find(row => row.id === historicalId), historical[0]);
    const detail = res(); await controller.obtenerRecetaPorId({ params: { id: kgId } }, detail);
    assert.equal(detail.body.weightKg, 10); assert.equal(detail.body.procedures.length, 2);
    const annul = res(); await controller.anularReceta({ params: { id: kgId }, user: { id: user.usuario_id } }, annul);
    assert.equal(annul.code, 200);
    const annulled = (await controller.obtenerRecetas(adapter)).find(row => row.id === kgId);
    assert.equal(annulled.weightKg, 10); assert.equal(annulled.procedureTotal, 314.79);
    const [[salesAfter]] = await c.query('SELECT COUNT(*) AS count FROM cierre_venta');
    const [[paymentsAfter]] = await c.query('SELECT COUNT(*) AS count FROM venta_pago');
    assert.deepEqual(salesAfter, salesBefore); assert.deepEqual(paymentsAfter, paymentsBefore);
    assert(writes.some(sql => sql.includes('receta_consulta')));
  } finally {
    await c.rollback(); c.release(); await pool.end();
    if (previousDb) require.cache[dbPath] = previousDb; else delete require.cache[dbPath];
  }
});
