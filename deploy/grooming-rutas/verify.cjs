// Verificación de solo lectura. No conecta a MySQL ni modifica archivos.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const manifest = require('./manifest.json');
const root = path.resolve(process.argv[2] || '.');
const state = process.argv[3] || 'before';
if (!['before', 'after'].includes(state)) throw new Error('Use before o after');
let failed = false;
for (const [name, hashes] of Object.entries(manifest.files)) {
  const file = path.join(root, name);
  const actual = fs.existsSync(file)
    ? createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
    : null;
  if (actual !== hashes[state]) { failed = true; console.error(`No coincide: ${name}`); }
}
if (failed) process.exitCode = 1;
else console.log(`Archivos de grooming verificados (${state}).`);
