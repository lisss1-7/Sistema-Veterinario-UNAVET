const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { inspectRelease, verifyTarget } = require('../../deploy/actualizacion-controlada/verify.cjs');
const root = path.resolve(__dirname, '../..');

test('entrega conjunta: ocho mejoras, veinte archivos y migraciones auxiliares compatibles', () => {
  const result = verifyTarget(root, 'after');
  assert.equal(result.release.improvements.length, 8);
  assert.equal(new Set(result.release.improvements).size, 8);
  assert.equal(result.changed.size, 20);
  assert.deepEqual(result.release.packages.map(item => item.name), ['caja-fondos', 'grooming-rutas', 'recetas-consulta']);
  const migrations = result.release.packages.flatMap(item => item.migrations);
  assert.deepEqual(migrations, ['backend/src/scripts/groomingTransportMigration.sql', 'backend/src/scripts/prescriptionConsultationMigration.sql']);
  const sql = migrations.map(name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^--.*$/gm, '')).join('\n');
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 3);
  assert.doesNotMatch(sql, /\b(?:ALTER|INSERT|UPDATE|DROP)\b|DELETE FROM/i);
  assert.doesNotMatch(sql, /\b(?:anulada|motivo_anulacion|anulada_por|anulada_en)\b/);
  assert.equal(result.release.activation.variable, 'CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID');
  assert.equal(result.release.productionDeploymentExecuted, false);
});

test('los tres parches se aplican juntos a la base verificada sin incorporar otros módulos', { timeout: 30000 }, () => {
  const { release, files, changed } = inspectRelease();
  const parent = fs.realpathSync(os.tmpdir());
  const target = fs.mkdtempSync(path.join(parent, 'unavet-release-'));
  const git = args => execFileSync('git', ['-C', target, ...args], { encoding: 'utf8', stdio: 'pipe' });
  try {
    for (const [name] of files) {
      const destination = path.join(target, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n'));
    }
    const untouched = path.join(target, 'modulo-ajeno.txt');
    fs.writeFileSync(untouched, 'Debe conservarse exactamente.\n');
    git(['init', '-q']);
    git(['config', 'core.autocrlf', 'false']);
    // Reconstruir el original y contrastar con las huellas de AWS guardadas;
    // después aplicar la secuencia real. No se ejecuta ningún SQL.
    for (const item of [...release.packages].reverse()) {
      git(['apply', '--reverse', '--check', path.join(root, item.patch)]);
      git(['apply', '--reverse', path.join(root, item.patch)]);
    }
    verifyTarget(target, 'before');
    for (const item of release.packages) {
      git(['apply', '--check', path.join(root, item.patch)]);
      git(['apply', path.join(root, item.patch)]);
    }
    verifyTarget(target, 'after');
    assert.equal(fs.readFileSync(untouched, 'utf8'), 'Debe conservarse exactamente.\n');
    const expected = [...files.keys(), 'modulo-ajeno.txt'].sort();
    const actual = fs.readdirSync(target, { recursive: true, withFileTypes: true })
      .filter(item => item.isFile()).map(item => path.relative(target, path.join(item.parentPath, item.name)).replace(/\\/g, '/'))
      .filter(name => !name.startsWith('.git/')).sort();
    assert.deepEqual(actual, expected);
    const controller = path.join(target, 'backend/src/controllers/cierreVentasController.js');
    fs.appendFileSync(controller, '\n// Cambio externo inesperado\n');
    assert.throws(() => verifyTarget(target, 'after'), /cierreVentasController/);
    assert.equal(changed.size, 20);
  } finally {
    const resolved = fs.realpathSync(target);
    assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('unavet-release-'));
    fs.rmSync(resolved, { recursive: true, force: false });
  }
});
