const fs = require('fs');

const readInteger = (env, name, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const value = String(env[name] || '').trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} debe ser un entero entre 1 y ${max}`);
  }
  return parsed;
};

const getDatabaseOptions = (env = process.env) => {
  const sslEnabled = String(env.DB_SSL || 'false').trim();
  if (!['true', 'false'].includes(sslEnabled)) {
    throw new Error('DB_SSL debe ser true o false');
  }
  const caPath = String(env.DB_SSL_CA_PATH || '').trim();
  if (caPath && sslEnabled !== 'true') {
    throw new Error('DB_SSL_CA_PATH requiere DB_SSL=true');
  }

  const options = {
    host: env.DB_HOST,
    port: readInteger(env, 'DB_PORT', 3306, 65535),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: readInteger(env, 'DB_CONNECTION_LIMIT', 10),
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  if (sslEnabled === 'true') {
    options.ssl = { rejectUnauthorized: true, verifyIdentity: true };
    if (caPath) {
      try {
        options.ssl.ca = fs.readFileSync(caPath, 'utf8');
      } catch {
        throw new Error('No se pudo leer el certificado indicado en DB_SSL_CA_PATH');
      }
    }
  }

  return options;
};

module.exports = { getDatabaseOptions };
