const crypto = require('crypto');

const securityHeaders = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(requestId).slice(0, 100);

  res.set({
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Request-Id': req.requestId,
  });

  next();
};

const hideInternalErrors = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (
      res.statusCode >= 500 &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      const { error, stack, ...safeBody } = body;
      return sendJson(safeBody);
    }
    return sendJson(body);
  };

  return next();
};

module.exports = { hideInternalErrors, securityHeaders };
