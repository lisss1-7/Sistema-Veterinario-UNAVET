const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

const mountFrontend = (app, directory = path.join(__dirname, '../../../dist')) => {
  const indexPath = path.join(directory, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('SERVE_FRONTEND=true requiere compilar el frontend con npm run build');
  }

  // Autoriza el script existente que aplica el tema sin permitir scripts inline arbitrarios.
  const html = fs.readFileSync(indexPath, 'utf8');
  const scriptHashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, content]) => !/\bsrc\s*=/i.test(attributes) && content.trim())
    .map(([, , content]) => `'sha256-${crypto.createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('base64')}'`);
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: data:",
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  const setHeaders = (res, filePath) => {
    res.setHeader('Content-Security-Policy', policy);
    const isAsset = path.relative(directory, filePath).startsWith(`assets${path.sep}`);
    res.setHeader('Cache-Control', isAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
  };
  const serveStatic = express.static(directory, { setHeaders });

  app.use((req, res, next) => {
    // Una API inexistente conserva su 404 JSON; nunca debe recibir el HTML de React.
    if (/^\/api(?:\/|$)/i.test(req.path)) return next();
    return serveStatic(req, res, next);
  });

  app.use((req, res, next) => {
    if (
      !['GET', 'HEAD'].includes(req.method) ||
      /^\/api(?:\/|$)/i.test(req.path) ||
      path.extname(req.path) ||
      !req.accepts('html')
    ) {
      return next();
    }
    setHeaders(res, indexPath);
    return res.sendFile(indexPath);
  });
};

module.exports = { mountFrontend };
