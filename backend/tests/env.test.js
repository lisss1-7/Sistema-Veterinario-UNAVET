const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../src/config/env');

const productionEnvironment = {
  NODE_ENV: 'production',
  DB_HOST: 'database.internal',
  DB_USER: 'unavet',
  DB_PASSWORD: 'database-password',
  DB_NAME: 'unavet',
  JWT_SECRET: 'jwt-secret-with-at-least-32-characters',
  PASSWORD_RESET_SECRET: 'reset-secret-with-at-least-32-characters',
  MEDIA_STORAGE_PATH: '/persistent/unavet-media',
  MEDIA_SIGNING_SECRET: 'media-secret-with-at-least-32-characters',
  FRONTEND_URL: 'https://unavet.example',
  SMTP_HOST: 'smtp.example',
  SMTP_USER: 'mailer',
  SMTP_PASS: 'smtp-password',
  SMTP_FROM: 'UNAVET <no-reply@unavet.example>',
};

const withEnvironment = (values, callback) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('acepta una configuración de producción completa y separa los secretos', () => {
  withEnvironment(productionEnvironment, () => {
    assert.doesNotThrow(validateEnvironment);
  });
});

test('rechaza producción sin almacenamiento multimedia persistente', () => {
  withEnvironment(
    { ...productionEnvironment, MEDIA_STORAGE_PATH: undefined },
    () => {
      assert.throws(validateEnvironment, /MEDIA_STORAGE_PATH/);
    }
  );
});
