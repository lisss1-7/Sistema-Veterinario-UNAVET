const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

test('MySQL local: migración completa, claves foráneas, unicidad e idempotencia en tablas desechables', {
  skip: process.env.UNAVET_TEST_LOCAL_MYSQL !== 'true', timeout: 30000,
}, async () => {
  const settings = { ...require('dotenv').parse(fs.readFileSync(process.env.UNAVET_TEST_ENV_FILE || path.join(__dirname, '../.env'))), ...process.env };
  assert(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST), 'Solo se admite MySQL local');
  const mysql = require('mysql2/promise');
  const { getDatabaseOptions } = require('../src/config/dbOptions');
  const pool = mysql.createPool(getDatabaseOptions(settings));
  const connection = await pool.getConnection();
  const prefix = `ut_groom_${randomBytes(4).toString('hex')}_`;
  assert.match(prefix, /^ut_groom_[a-f0-9]{8}_$/);
  const names = ['grooming_transporte_ruta', 'grooming_operacion', 'tutor', 'tipo_grooming', 'cita_grooming', 'forma_pago'];
  const created = [];
  // La cuenta local no necesita privilegios CREATE DATABASE. Solo se emplean
  // tablas nuevas con prefijo aleatorio y referencias entre ellas mismas.
  const query = (sql, values) => connection.query(sql.replace(new RegExp(`\\b(${names.join('|')})\\b`, 'g'), name => prefix + name)
    .replace(/CONSTRAINT (\w+)/g, (_, name) => `CONSTRAINT ${prefix}${name}`), values);
  try {
    // No se usa ninguna tabla ni dato de la clínica.
    for (const [table, column, type] of [['tutor', 'tutor_id', 'BIGINT UNSIGNED'], ['tipo_grooming', 'tipo_grooming_id', 'INT'],
      ['cita_grooming', 'grooming_id', 'BIGINT UNSIGNED'], ['forma_pago', 'forma_pago_id', 'INT UNSIGNED']]) {
      await query(`CREATE TABLE ${table} (${column} ${type} PRIMARY KEY) ENGINE=InnoDB`);
      created.push(prefix + table);
      await query(`INSERT INTO ${table} VALUES (1), (2)`);
    }
    const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/groomingTransportMigration.sql'), 'utf8');
    const statements = migration.replace(/^--.*$/gm, '').split(';').filter(sql => sql.trim());
    for (let run = 0; run < 2; run++) for (const statement of statements) {
      await query(statement);
      if (run === 0) created.push(prefix + statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]);
    }
    await query(`INSERT INTO grooming_transporte_ruta
      (tutor_id, tipo_grooming_id, fecha, hora, direccion, direccion_key, costo)
      VALUES (1, 1, '2099-10-06', '09:00', 'Domicilio de prueba', ?, 30)`, ['a'.repeat(64)]);
    await assert.rejects(query(`INSERT INTO grooming_transporte_ruta
      (tutor_id, tipo_grooming_id, fecha, hora, direccion, direccion_key, costo)
      VALUES (1, 1, '2099-10-06', '09:00', 'Domicilio de prueba', ?, 30)`, ['a'.repeat(64)]), { code: 'ER_DUP_ENTRY' });
    await query('INSERT INTO grooming_operacion VALUES (1, 1, 1), (2, 2, 1)');
    await assert.rejects(query('UPDATE grooming_operacion SET forma_pago_id = 999 WHERE grooming_id = 1'), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(query('DELETE FROM grooming_transporte_ruta WHERE ruta_id = 1'), { code: 'ER_ROW_IS_REFERENCED_2' });
    await query('DELETE FROM cita_grooming WHERE grooming_id = 1');
    const [rows] = await query('SELECT * FROM grooming_operacion');
    assert.equal(rows.length, 1); assert.equal(Number(rows[0].grooming_id), 2);
    const [[route]] = await query('SELECT costo FROM grooming_transporte_ruta WHERE ruta_id = 1');
    assert.equal(Number(route.costo), 30);
  } finally {
    for (const table of created.reverse()) {
      assert.ok(table.startsWith(prefix) && names.some(name => table === prefix + name));
      await connection.query(`DROP TABLE \`${table}\``);
      const [rows] = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
      assert.equal(rows.length, 0);
    }
    connection.release(); await pool.end();
  }
});
