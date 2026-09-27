const createRateLimiter = ({ windowMs, max, message, keyGenerator }) => {
  const attempts = new Map();
  let operations = 0;

  return (req, res, next) => {
    const now = Date.now();
    const discriminator = keyGenerator ? keyGenerator(req) : '';
    const key = `${req.ip}:${req.baseUrl}${req.path}:${discriminator}`;
    const current = attempts.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    entry.count += 1;
    attempts.set(key, entry);
    if (attempts.size > 10000) {
      attempts.delete(attempts.keys().next().value);
    }

    const remaining = Math.max(0, max - entry.count);
    res.set({
      'RateLimit-Limit': String(max),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    });

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    operations += 1;
    if (operations % 100 === 0) {
      for (const [storedKey, storedEntry] of attempts) {
        if (storedEntry.resetAt <= now) attempts.delete(storedKey);
      }
    }

    return next();
  };
};

module.exports = { createRateLimiter };
