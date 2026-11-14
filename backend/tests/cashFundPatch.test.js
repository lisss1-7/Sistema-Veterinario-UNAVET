const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const manifest = require('../../deploy/caja-fondos/manifest.json');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const hash = source => createHash('sha256').update(source).digest('hex');

test('el parche entregado coincide con las fuentes verificadas y solo contiene caja', () => {
  for (const [name, hashes] of Object.entries(manifest.files)) assert.equal(hash(read(name)), hashes.after, name);
  const patch = read('deploy/caja-fondos/production.patch');
  const files = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
    assert.equal(match[1], match[2]); return match[1];
  });
  assert.deepEqual(files.sort(), Object.entries(manifest.files).filter(([, value]) => value.before !== value.after).map(([name]) => name).sort());
  assert.equal(files.length, 7);
  const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  assert.doesNotMatch(additions, /\b(?:ALTER TABLE|CREATE TABLE|DROP TABLE|UPDATE cierre_venta_turno|DELETE FROM cierre_venta_turno)\b/i);
});

test('creación, eliminación, bloqueo y finalización conservan el código original de AWS', () => {
  const controller = read('backend/src/controllers/cierreVentasController.js');
  for (const [name, expected] of Object.entries(manifest.preservedFunctions)) {
    const start = controller.indexOf(`const ${name} =`);
    assert.ok(start >= 0);
    const end = controller.indexOf('\n};', start) + 3;
    assert.equal(hash(controller.slice(start, end)), expected, name);
  }
  const route = manifest.files['backend/src/routes/cierreVentasRoutes.js'];
  assert.equal(route.before, route.after);
  assert.doesNotMatch(read('backend/src/routes/cierreVentasRoutes.js'), /\/anular/);
  assert.match(controller, /DELETE FROM cierre_venta\s+WHERE venta_id = \?/);
  assert.doesNotMatch(controller, /\b(?:motivo_anulacion|anulada_por|anulada_en)\b/);
});
