const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const manifest = require('../../deploy/grooming-rutas/manifest.json');
const extension = require('../../deploy/grooming-mascotas-nuevas/manifest.json');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');

test('la entrega coincide con las fuentes probadas y se limita a siete archivos de Grooming', () => {
  for (const [name, hashes] of Object.entries(manifest.files)) {
    if (extension.files[name]) assert.equal(extension.files[name].before, hashes.after, name);
    assert.equal(createHash('sha256').update(read(name)).digest('hex'), extension.files[name]?.after || hashes.after, name);
  }
  const files = [...read('deploy/grooming-rutas/production.patch').matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
    assert.equal(match[1], match[2]); return match[1];
  });
  assert.deepEqual(files.sort(), Object.entries(manifest.files).filter(([, hashes]) => hashes.before !== hashes.after).map(([name]) => name).sort());
  assert.equal(files.length, 7);
  assert.ok(files.every(name => !/cierreVentas|salesShift|salesAccounting|salesClosing/.test(name)));
});

test('conserva los módulos compartidos, los permisos y los tipos de FK verificados en producción', () => {
  for (const name of ['backend/src/utils/scheduleUtils.js', 'backend/src/utils/groomingHistory.js', 'backend/src/controllers/catalogosController.js', 'src/app/components/SearchablePatientSelect.tsx']) {
    assert.equal(manifest.files[name].before, manifest.files[name].after, name);
  }
  const routes = read('backend/src/routes/groomingRoutes.js').split('\n').filter(line => line.startsWith('router.'));
  assert.equal(routes.length, 7);
  assert(routes.every(line => line.includes('verificarToken') && line.includes("verificarPermiso('grooming',")));
  assert.equal(manifest.schemaPreconditions.tutor.columnType, 'bigint unsigned');
  assert.equal(manifest.schemaPreconditions.cita_grooming.columnType, 'bigint unsigned');
  assert.equal(manifest.schemaPreconditions.tipo_grooming.columnType, 'int');
  assert.equal(manifest.schemaPreconditions.forma_pago.columnType, 'int unsigned');
  assert(Object.values(manifest.schemaPreconditions).every(table => table.engine === 'InnoDB'));
});
