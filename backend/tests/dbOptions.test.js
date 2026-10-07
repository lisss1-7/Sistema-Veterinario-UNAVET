const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabaseOptions } = require('../src/config/dbOptions');

test('conserva la conexión MySQL local sin TLS y los límites existentes', () => {
  const options = getDatabaseOptions({ DB_HOST: 'localhost', DB_USER: 'local', DB_NAME: 'unavet' });
  assert.equal(options.host, 'localhost');
  assert.equal(options.port, 3306);
  assert.equal(options.password, '');
  assert.equal(options.connectionLimit, 10);
  assert.equal(options.charset, 'utf8mb4');
  assert.equal(options.ssl, undefined);
});

test('permite puerto y límite de conexiones del servidor remoto', () => {
  const options = getDatabaseOptions({ DB_PORT: '3307', DB_CONNECTION_LIMIT: '4' });
  assert.equal(options.port, 3307);
  assert.equal(options.connectionLimit, 4);
});

test('TLS verifica el certificado y la identidad del servidor', () => {
  const options = getDatabaseOptions({ DB_SSL: 'true' });
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, verifyIdentity: true });
});

test('carga la CA montada sin desactivar las verificaciones TLS', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unavet-ca-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const caPath = path.join(directory, 'ca.pem');
  fs.writeFileSync(caPath, 'test-ca-content');
  const options = getDatabaseOptions({ DB_SSL: 'true', DB_SSL_CA_PATH: caPath });
  assert.equal(options.ssl.ca, 'test-ca-content');
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.verifyIdentity, true);
});

test('rechaza opciones inválidas y no ignora una CA sin TLS', () => {
  for (const env of [
    { DB_PORT: 'not-a-port' },
    { DB_PORT: '65536' },
    { DB_PORT: '-1' },
    { DB_CONNECTION_LIMIT: '0' },
    { DB_CONNECTION_LIMIT: '1.5' },
    { DB_SSL: 'yes' },
    { DB_SSL_CA_PATH: 'unused-ca.pem' },
    { DB_SSL: 'true', DB_SSL_CA_PATH: path.join(os.tmpdir(), 'unavet-nonexistent-ca.pem') },
  ]) {
    assert.throws(() => getDatabaseOptions(env), /DB_/);
  }
});
