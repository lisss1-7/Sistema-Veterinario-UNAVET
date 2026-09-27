const REQUIRED_VARIABLES = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const PRODUCTION_REQUIRED_VARIABLES = [
  'DB_PASSWORD',
  'PASSWORD_RESET_SECRET',
  'MEDIA_STORAGE_PATH',
  'MEDIA_SIGNING_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];

const validateEnvironment = () => {
  const missing = REQUIRED_VARIABLES.filter(
    (name) => !String(process.env[name] || '').trim()
  );

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}`
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    String(process.env.JWT_SECRET).length < 32
  ) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProduction = PRODUCTION_REQUIRED_VARIABLES.filter(
      (name) => !String(process.env[name] || '').trim()
    );
    if (missingProduction.length > 0) {
      throw new Error(
        `Faltan variables obligatorias de producción: ${missingProduction.join(', ')}`
      );
    }

    for (const secretName of ['PASSWORD_RESET_SECRET', 'MEDIA_SIGNING_SECRET']) {
      if (String(process.env[secretName]).length < 32) {
        throw new Error(`${secretName} debe tener al menos 32 caracteres en producción`);
      }
      if (process.env[secretName] === process.env.JWT_SECRET) {
        throw new Error(`${secretName} debe ser diferente de JWT_SECRET`);
      }
    }
  }

  if (
    process.env.NODE_ENV === 'production' &&
    !String(process.env.FRONTEND_URL || process.env.CORS_ORIGINS || '').trim()
  ) {
    throw new Error(
      'Configure FRONTEND_URL o CORS_ORIGINS antes de iniciar en producción'
    );
  }
};

module.exports = { validateEnvironment };
