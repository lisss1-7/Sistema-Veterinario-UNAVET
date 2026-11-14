// Solo lectura: extensión de Grooming sobre el paquete de producción 09c6fdf.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { digest, inspectRelease, validatePatch } = require('../actualizacion-controlada/verify.cjs');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const searchDirectory = path.join(root, 'deploy/recetas-busqueda');
const search = JSON.parse(fs.readFileSync(path.join(searchDirectory, 'manifest.json'), 'utf8'));
function verifyTarget(target, phase = 'after') {
  assert(['before', 'after'].includes(phase));
  const release = inspectRelease(root);
  for (const [directory, item] of [[__dirname, manifest], [searchDirectory, search]]) {
    const patch = path.join(directory, 'production.patch');
    assert.equal(digest(patch), item.patchSha256, 'Parche incremental alterado');
    const text = fs.readFileSync(patch, 'utf8').replace(/\r\n/g, '\n'); validatePatch(text);
    const names = [...text.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
      assert.equal(match[1], match[2]); return match[1];
    });
    assert.deepEqual(names.sort(), Object.keys(item.files).sort());
  }
  const extensions = { ...manifest.files, ...search.files };
  for (const [name, expected] of release.files) {
    const extension = extensions[name];
    if (extension) assert.equal(extension.before, expected.after, 'La extensión debe partir de producción');
    assert.equal(digest(path.join(target, name)), extension ? extension[phase] : expected.after, `Fuente incompatible: ${name}`);
  }
  assert.equal(manifest.migrationRequired, false);
  assert.equal(search.migrationRequired, false);
  assert.deepEqual(Object.keys(search.files), ['src/app/pages/Prescriptions.tsx']);
  assert.deepEqual(Object.keys(manifest.files).sort(), ['backend/src/controllers/groomingController.js', 'src/app/pages/Grooming.tsx']);
  return release;
}
module.exports = { verifyTarget, manifest };
if (require.main === module) {
  try { const result = verifyTarget(path.resolve(process.argv[2] || root), process.argv[3] || 'after'); console.log(`OK: dos archivos de Grooming y uno de Recetas; ${result.files.size} fuentes y controles verificados; sin SQL.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
