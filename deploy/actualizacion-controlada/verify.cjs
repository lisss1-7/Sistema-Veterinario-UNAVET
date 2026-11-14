// Solo lectura: valida archivos locales. No conecta a MySQL, AWS ni ejecuta parches.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const packageRoot = path.resolve(__dirname, '../..');
const digest = file => fs.existsSync(file)
  ? createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex') : null;
const safePath = (root, name) => {
  if (!name || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw new Error('Ruta de paquete no válida');
  return path.join(root, name);
};
function inspectRelease(root = packageRoot) {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'deploy/actualizacion-controlada/release.json'), 'utf8'));
  const files = new Map(), changed = new Set();
  for (const item of release.packages) {
    for (const [name, expected] of Object.entries(item.artifacts)) {
      if (digest(safePath(root, name)) !== expected) throw new Error(`Paquete alterado: ${name}`);
    }
    const manifest = JSON.parse(fs.readFileSync(safePath(root, item.manifest), 'utf8'));
    const patch = fs.readFileSync(safePath(root, item.patch), 'utf8').replace(/\r\n/g, '\n');
    const patched = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
      if (match[1] !== match[2]) throw new Error('El paquete no admite renombrar archivos');
      safePath(root, match[1]); return match[1];
    });
    const expectedFiles = Object.entries(manifest.files).filter(([, hashes]) => hashes.before !== hashes.after).map(([name]) => name);
    if (JSON.stringify(patched.sort()) !== JSON.stringify(expectedFiles.sort())) throw new Error(`Alcance incorrecto: ${item.patch}`);
    for (const [name, hashes] of Object.entries(manifest.files)) {
      safePath(root, name);
      if (files.has(name) && JSON.stringify(files.get(name)) !== JSON.stringify(hashes)) throw new Error(`Conflicto entre parches: ${name}`);
      files.set(name, hashes);
      if (hashes.before !== hashes.after) changed.add(name);
    }
  }
  return { release, files, changed };
}
function verifyTarget(target, state, root = packageRoot) {
  if (!['before', 'after'].includes(state)) throw new Error('Use before o after');
  const result = inspectRelease(root);
  const failures = [];
  for (const [name, hashes] of result.files) if (digest(safePath(target, name)) !== hashes[state]) failures.push(name);
  if (failures.length) throw new Error(`No coinciden (${state}): ${failures.join(', ')}`);
  return result;
}
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Indique una copia local de las fuentes de producción');
    const state = process.argv[3] || 'before';
    const result = verifyTarget(path.resolve(process.argv[2]), state);
    console.log(`Entrega conjunta verificada (${state}): ${result.release.improvements.length} mejoras, ${result.changed.size} archivos en los parches.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { digest, inspectRelease, verifyTarget };
