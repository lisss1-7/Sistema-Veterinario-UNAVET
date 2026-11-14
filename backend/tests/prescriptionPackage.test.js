const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const manifest = require('../../deploy/recetas-consulta/manifest.json');

test('paquete de Recetas coincide con las fuentes probadas y cambia solo cinco archivos del módulo', () => {
  for (const [name, hashes] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(read(name)).digest('hex'), hashes.after, name);
  const files = [...read('deploy/recetas-consulta/production.patch').matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
    assert.equal(match[1], match[2]); return match[1];
  });
  assert.deepEqual(files.sort(), Object.entries(manifest.files).filter(([, hashes]) => hashes.before !== hashes.after).map(([name]) => name).sort());
  assert.equal(files.length, 5);
  assert.ok(files.every(name => !/grooming|sales|cierre|pacientesController|historialController/i.test(name)));
  assert.equal(manifest.schemaPreconditions.receta.idType, 'bigint unsigned');
});
test('rutas, permisos, catálogo, inventario y presentación clínica compartida se conservan', () => {
  for (const name of ['backend/src/routes/recetasRoutes.js', 'backend/src/controllers/catalogosController.js',
    'backend/src/utils/inventoryLots.js', 'src/app/utils/clinicalText.ts', 'src/app/utils/pdfBranding.ts']) {
    assert.equal(manifest.files[name].before, manifest.files[name].after, name);
  }
  const source = read('backend/src/routes/recetasRoutes.js');
  assert.equal((source.match(/verificarPermiso\('prescriptions',/g) || []).length, 6);
  assert.equal((source.match(/verificarToken,/g) || []).length, 6);
  assert.ok(!/migrate|Migration/.test(read('backend/src/server.js')));
});
