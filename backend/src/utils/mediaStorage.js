const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

const MEDIA_PREFIX = 'media:';
const ALLOWED_BUCKETS = new Set(['patients', 'treatments']);
const MIME_CONFIG = Object.freeze({
  'image/jpeg': { extension: '.jpg', signature: 'jpeg' },
  'image/png': { extension: '.png', signature: 'png' },
  'image/webp': { extension: '.webp', signature: 'webp' },
  'application/pdf': { extension: '.pdf', signature: 'pdf' },
});
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_URL_TTL_SECONDS = 60 * 60;

const isAllowedMediaFilename = (bucket, filename) =>
  /^[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/.test(filename || '') &&
  (!filename.endsWith('.pdf') || bucket === 'treatments');

const getPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getStorageRoot = () =>
  path.resolve(
    process.env.MEDIA_STORAGE_PATH ||
      path.join(__dirname, '../../storage/media')
  );

const getMaxBytes = () =>
  Math.min(
    getPositiveInteger(process.env.MEDIA_MAX_BYTES, DEFAULT_MAX_BYTES),
    10 * 1024 * 1024
  );

const createMediaError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const assertBucket = (bucket) => {
  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw createMediaError('La categoría de imagen no es válida');
  }
};

const hasExpectedSignature = (buffer, signature) => {
  if (signature === 'pdf') {
    return (
      /^%PDF-[12]\.\d/.test(buffer.subarray(0, 8).toString('ascii')) &&
      buffer.subarray(-1024).includes(Buffer.from('%%EOF'))
    );
  }
  if (signature === 'jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (signature === 'png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    );
  }
  if (signature === 'webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
};

const parseDataUrl = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/
  );
  if (!match) return null;

  const mimeType = match[1];
  const config = MIME_CONFIG[mimeType];
  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length || !hasExpectedSignature(buffer, config.signature)) {
    throw createMediaError(mimeType === 'application/pdf'
      ? 'El contenido del archivo PDF no es válido'
      : 'El contenido de la imagen no es válido');
  }
  if (buffer.length > getMaxBytes()) {
    throw createMediaError(
      `El archivo adjunto excede el límite de ${Math.ceil(getMaxBytes() / 1024 / 1024)} MB`
    );
  }

  return { buffer, extension: config.extension };
};

const parseManagedReference = (value) => {
  if (typeof value !== 'string' || !value.startsWith(MEDIA_PREFIX)) {
    return null;
  }

  const relative = value.slice(MEDIA_PREFIX.length);
  const parts = relative.split('/');
  if (parts.length !== 2) return null;

  const [bucket, filename] = parts;
  if (
    !ALLOWED_BUCKETS.has(bucket) ||
    !isAllowedMediaFilename(bucket, filename)
  ) {
    return null;
  }

  return { bucket, filename, reference: `${MEDIA_PREFIX}${bucket}/${filename}` };
};

const extractManagedReference = (value) => {
  const direct = parseManagedReference(value);
  if (direct) return direct.reference;
  if (typeof value !== 'string') return null;

  try {
    const parsed = new URL(value, 'http://unavet.local');
    const match = parsed.pathname.match(
      /^\/(?:api\/)?media\/(patients|treatments)\/([0-9a-f-]{36}\.(?:jpg|png|webp|pdf))$/
    );
    return match ? parseManagedReference(`${MEDIA_PREFIX}${match[1]}/${match[2]}`)?.reference || null : null;
  } catch {
    return null;
  }
};

const saveDataUrl = async (value, bucket) => {
  assertBucket(bucket);
  const parsed = parseDataUrl(value);
  if (!parsed) {
    throw createMediaError(bucket === 'treatments'
      ? 'El adjunto debe ser una imagen JPEG, PNG, WebP o un PDF válido'
      : 'La fotografía debe ser una imagen JPEG, PNG o WebP válida');
  }
  if (parsed.extension === '.pdf' && bucket !== 'treatments') {
    throw createMediaError('Los archivos PDF solo se admiten en servicios y tratamientos');
  }

  const filename = `${crypto.randomUUID()}${parsed.extension}`;
  const directory = path.join(getStorageRoot(), bucket);
  const targetPath = path.join(directory, filename);
  const temporaryPath = `${targetPath}.tmp`;

  await fsPromises.mkdir(directory, { recursive: true });
  await fsPromises.writeFile(temporaryPath, parsed.buffer, { flag: 'wx' });
  try {
    await fsPromises.rename(temporaryPath, targetPath);
  } catch (error) {
    await fsPromises.unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return `${MEDIA_PREFIX}${bucket}/${filename}`;
};

const prepareMediaValue = async (value, bucket, existingReference = null) => {
  if (value === null || value === undefined || value === '') {
    return { value: null, createdReference: null };
  }

  const managedReference = extractManagedReference(value);
  if (managedReference) {
    if (existingReference && managedReference === existingReference) {
      return { value: existingReference, createdReference: null };
    }
    throw createMediaError('La referencia de la fotografía no corresponde al registro');
  }

  if (!String(value).startsWith('data:')) {
    if (existingReference && value === existingReference) {
      return { value: existingReference, createdReference: null };
    }
    throw createMediaError('La referencia de la fotografía no es válida');
  }

  const reference = await saveDataUrl(value, bucket);
  return { value: reference, createdReference: reference };
};

const getSigningSecret = () =>
  process.env.MEDIA_SIGNING_SECRET || process.env.JWT_SECRET || '';

const sign = (payload) =>
  crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');

const toClientMediaReference = (value) => {
  const parsed = parseManagedReference(value);
  if (!parsed) return value || '';

  const ttl = Math.min(
    getPositiveInteger(process.env.MEDIA_URL_TTL_SECONDS, DEFAULT_URL_TTL_SECONDS),
    24 * 60 * 60
  );
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${parsed.bucket}/${parsed.filename}:${expires}`;
  const signature = sign(payload);
  return `media/${parsed.bucket}/${parsed.filename}?expires=${expires}&signature=${signature}`;
};

const verifySignedMediaRequest = ({ bucket, filename, expires, signature }) => {
  assertBucket(bucket);
  if (!isAllowedMediaFilename(bucket, filename)) return false;

  const parsedExpiry = Number(expires);
  if (!Number.isSafeInteger(parsedExpiry) || parsedExpiry < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = sign(`${bucket}/${filename}:${parsedExpiry}`);
  if (typeof signature !== 'string' || signature.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

const getMediaFile = (bucket, filename) => {
  assertBucket(bucket);
  if (!isAllowedMediaFilename(bucket, filename)) return null;

  const filePath = path.join(getStorageRoot(), bucket, filename);
  const extension = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return { filePath, contentType: contentTypes[extension] };
};

const deleteMedia = async (reference) => {
  const parsed = parseManagedReference(reference);
  if (!parsed) return;
  const media = getMediaFile(parsed.bucket, parsed.filename);
  await fsPromises.unlink(media.filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

const createReadStream = (filePath) => fs.createReadStream(filePath);

module.exports = {
  createReadStream,
  deleteMedia,
  extractManagedReference,
  getMediaFile,
  getStorageRoot,
  prepareMediaValue,
  saveDataUrl,
  toClientMediaReference,
  verifySignedMediaRequest,
};
