const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const mediaRoutes = require('../src/routes/mediaRoutes');
const { securityHeaders } = require('../src/middleware/securityMiddleware');

const {
  deleteMedia,
  extractManagedReference,
  getMediaFile,
  prepareMediaValue,
  toClientMediaReference,
  verifySignedMediaRequest,
} = require('../src/utils/mediaStorage');

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('guarda imágenes válidas fuera de la base de datos y firma su acceso', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'unavet-media-'));
  const previousRoot = process.env.MEDIA_STORAGE_PATH;
  const previousSecret = process.env.MEDIA_SIGNING_SECRET;
  process.env.MEDIA_STORAGE_PATH = storageRoot;
  process.env.MEDIA_SIGNING_SECRET = 'test-media-secret-with-enough-entropy';

  t.after(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_STORAGE_PATH;
    else process.env.MEDIA_STORAGE_PATH = previousRoot;
    if (previousSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET;
    else process.env.MEDIA_SIGNING_SECRET = previousSecret;
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  const prepared = await prepareMediaValue(PNG_DATA_URL, 'patients');
  assert.match(prepared.value, /^media:patients\/[0-9a-f-]{36}\.png$/);

  const parsed = extractManagedReference(prepared.value);
  assert.equal(parsed, prepared.value);
  const clientReference = toClientMediaReference(prepared.value);
  assert.equal(extractManagedReference(clientReference), prepared.value);
  const url = new URL(clientReference, 'http://unavet.local/api/');
  const [, bucket, filename] = url.pathname.match(
    /\/api\/media\/(patients|treatments)\/(.+)$/
  );
  assert.equal(
    verifySignedMediaRequest({
      bucket,
      filename,
      expires: url.searchParams.get('expires'),
      signature: url.searchParams.get('signature'),
    }),
    true
  );

  const media = getMediaFile(bucket, filename);
  const stat = await fs.stat(media.filePath);
  assert.equal(stat.isFile(), true);

  await deleteMedia(prepared.value);
  await assert.rejects(fs.stat(media.filePath), { code: 'ENOENT' });
});

test('rechaza contenido que finge ser una imagen', async () => {
  await assert.rejects(
    prepareMediaValue('data:image/png;base64,SG9sYQ==', 'patients'),
    /contenido de la imagen no es válido/
  );
});

test('guarda PDF solo en tratamientos, sirve los bytes con firma y permite eliminarlos', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'unavet-pdf-'));
  const previousRoot = process.env.MEDIA_STORAGE_PATH;
  const previousSecret = process.env.MEDIA_SIGNING_SECRET;
  process.env.MEDIA_STORAGE_PATH = storageRoot;
  process.env.MEDIA_SIGNING_SECRET = 'test-pdf-media-secret';
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_STORAGE_PATH;
    else process.env.MEDIA_STORAGE_PATH = previousRoot;
    if (previousSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET;
    else process.env.MEDIA_SIGNING_SECRET = previousSecret;
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const dataUrl = `data:application/pdf;base64,${pdf.toString('base64')}`;
  const prepared = await prepareMediaValue(dataUrl, 'treatments');
  assert.match(prepared.value, /^media:treatments\/[0-9a-f-]{36}\.pdf$/);
  const signedReference = toClientMediaReference(prepared.value);
  assert.equal(extractManagedReference(signedReference), prepared.value);
  const filename = prepared.value.split('/').at(-1);
  const media = getMediaFile('treatments', filename);
  assert.equal(media.contentType, 'application/pdf');

  const app = express();
  app.use(securityHeaders);
  app.use('/api/media', mediaRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/`;
  const valid = await fetch(baseUrl + signedReference);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('content-type'), 'application/pdf');
  assert.match(valid.headers.get('content-disposition'), /^attachment; filename=".+\.pdf"$/);
  assert.deepEqual(Buffer.from(await valid.arrayBuffer()), pdf);
  const unsigned = await fetch(`${baseUrl}media/treatments/${filename}`);
  assert.equal(unsigned.status, 403);

  await assert.rejects(prepareMediaValue(dataUrl, 'patients'), /solo se admiten/);
  assert.equal(getMediaFile('patients', filename), null);
  assert.equal(extractManagedReference(`media/patients/${filename}`), null);
  await deleteMedia(prepared.value);
  await assert.rejects(fs.stat(media.filePath), { code: 'ENOENT' });
});

test('rechaza archivos renombrados como PDF, PDF incompleto y adjuntos demasiado grandes', async () => {
  for (const text of ['not-a-pdf', '%PDF-1.4\nincomplete']) {
    await assert.rejects(
      prepareMediaValue(`data:application/pdf;base64,${Buffer.from(text).toString('base64')}`, 'treatments'),
      /PDF no es válido/
    );
  }
  const previousLimit = process.env.MEDIA_MAX_BYTES;
  process.env.MEDIA_MAX_BYTES = '16';
  try {
    await assert.rejects(
      prepareMediaValue(`data:application/pdf;base64,${Buffer.from('%PDF-1.4\n'.padEnd(40, ' ') + '%%EOF').toString('base64')}`, 'treatments'),
      /excede el límite/
    );
  } finally {
    if (previousLimit === undefined) delete process.env.MEDIA_MAX_BYTES;
    else process.env.MEDIA_MAX_BYTES = previousLimit;
  }
});
