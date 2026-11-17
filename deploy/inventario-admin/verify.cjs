const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = require('./manifest.json');
const [root, phase] = process.argv.slice(2);
if (!root || !['before','after'].includes(phase)) throw new Error('Uso: node verify.cjs RUTA before|after');
for (const [name, expected] of Object.entries(manifest.files)) {
 const file = path.resolve(root, name);
 if (expected[phase] === null) {
  if (fs.existsSync(file)) throw new Error('Archivo inesperado: '+name);
 } else {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected[phase]) throw new Error('Huella diferente: '+name);
 }
}
for (const [name, hash] of [['production.patch',manifest.patchSha256],['compras.sql',manifest.migrationSha256]]) {
 if (crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex') !== hash) throw new Error('Paquete alterado: '+name);
}
console.log('Verificación correcta: '+phase+'; '+Object.keys(manifest.files).length+' archivos');
