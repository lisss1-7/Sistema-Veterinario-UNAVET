const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

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
