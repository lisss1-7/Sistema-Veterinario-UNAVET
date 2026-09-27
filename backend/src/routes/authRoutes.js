const express = require('express');
const { login } = require('../controllers/authController');
const {
  requestPasswordReset,
  resetPassword,
} = require('../controllers/passwordResetController');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en unos minutos.',
  keyGenerator: (req) => String(req.body?.correo || '').trim().toLowerCase(),
});
const recoveryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.',
  keyGenerator: (req) => String(req.body?.correo || '').trim().toLowerCase(),
});
const resetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos. Solicita un nuevo enlace más tarde.',
});

router.post('/login', loginLimiter, login);
router.post('/forgot-password', recoveryLimiter, requestPasswordReset);
router.post('/reset-password', resetLimiter, resetPassword);

module.exports = router;
