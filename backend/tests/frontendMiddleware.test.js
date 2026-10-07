const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { mountFrontend } = require('../src/middleware/frontendMiddleware');
const { securityHeaders } = require('../src/middleware/securityMiddleware');

test('sirve React y sus rutas conservando las respuestas y protección de la API', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'unavet-frontend-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inlineScript = "\r\ndocument.documentElement.classList.add('dark');\r\n";
  const html = `<html><script>${inlineScript}</script><div id="root"></div></html>`;
  await fs.mkdir(path.join(directory, 'assets'));
  await fs.writeFile(path.join(directory, 'index.html'), html);
  await fs.writeFile(path.join(directory, 'assets', 'app-hash.js'), 'export const app = true;');

  const app = express();
  app.use(securityHeaders);
  app.get('/api/protected', (req, res) => res.status(401).json({ message: 'Token requerido' }));
  mountFrontend(app, directory);
  app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const route of ['/', '/login', '/patients/123', '/reset-password?token=test']) {
    const response = await fetch(`${baseUrl}${route}`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const policy = response.headers.get('content-security-policy');
    const hash = crypto.createHash('sha256').update(inlineScript.replace(/\r\n?/g, '\n')).digest('base64');
    assert.ok(policy.includes(`'sha256-${hash}'`));
    assert.ok(policy.includes("frame-src 'self' blob:"), 'permite la vista previa PDF existente');
    assert.ok(policy.includes('https://fonts.googleapis.com'), 'conserva la tipografía existente');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }

  const asset = await fetch(`${baseUrl}/assets/app-hash.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await asset.text(), 'export const app = true;');

  for (const route of ['/api/missing', '/API/missing', '/assets/missing.js']) {
    const response = await fetch(`${baseUrl}${route}`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404, route);
    assert.deepEqual(await response.json(), { message: 'Ruta no encontrada' });
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  }
  const unauthorized = await fetch(`${baseUrl}/api/protected`);
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { message: 'Token requerido' });

  const post = await fetch(`${baseUrl}/patients/123`, { method: 'POST' });
  assert.equal(post.status, 404);
  const head = await fetch(`${baseUrl}/patients/123`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('falla al activar el frontend sin una compilación, en lugar de publicar una app incompleta', () => {
  assert.throws(() => mountFrontend(express(), path.join(os.tmpdir(), 'unavet-missing-dist')), /npm run build/);
});
