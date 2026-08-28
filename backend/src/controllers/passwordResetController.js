const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendPasswordResetEmail } = require('../utils/mailer');

const REQUEST_COOLDOWN_MS = 60 * 1000;
const recentRequests = new Map();

const getResetSecret = () =>
  process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;

const passwordVersion = (passwordHash) =>
  crypto.createHash('sha256').update(passwordHash).digest('hex');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const requestPasswordReset = async (req, res) => {
  const correo = normalizeEmail(req.body.correo);

  if (!correo) {
    return res.status(400).json({ message: 'El correo es obligatorio' });
  }

  const genericResponse = {
    message:
      'Si el correo está registrado, recibirás las instrucciones para restablecer tu contraseña.',
  };
  const cooldownKey = `${req.ip}:${correo}`;
  const lastRequest = recentRequests.get(cooldownKey) || 0;

  if (Date.now() - lastRequest < REQUEST_COOLDOWN_MS) {
    return res.json(genericResponse);
  }

  recentRequests.set(cooldownKey, Date.now());

  try {
    const [users] = await pool.query(
      `SELECT u.usuario_id, u.correo, u.password_hash, eu.permite_acceso
       FROM usuarios u
       INNER JOIN estados_usuario eu
         ON eu.estado_usuario_id = u.estado_usuario_id
       WHERE LOWER(u.correo) = ?
       LIMIT 1`,
      [correo]
    );

    if (users.length === 0 || !users[0].permite_acceso) {
      return res.json(genericResponse);
    }

    const secret = getResetSecret();
    if (!secret) {
      throw new Error('PASSWORD_RESET_SECRET o JWT_SECRET no está configurado');
    }

    const user = users[0];
    const token = jwt.sign(
      {
        sub: String(user.usuario_id),
        purpose: 'password-reset',
        passwordVersion: passwordVersion(user.password_hash),
      },
      secret,
      { expiresIn: '30m' }
    );
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .replace(/\/+$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(
      token
    )}`;

    await sendPasswordResetEmail({
      to: user.correo,
      resetUrl,
    });

    return res.json(genericResponse);
  } catch (error) {
    console.error('Error al solicitar recuperación de contraseña:', error);
    recentRequests.delete(cooldownKey);
    return res.status(503).json({
      message:
        'No fue posible enviar el correo en este momento. Intenta nuevamente más tarde.',
    });
  }
};

const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      message: 'Token, contraseña y confirmación son obligatorios',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 8 caracteres',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      message: 'La contraseña y la confirmación no coinciden',
    });
  }

  try {
    const payload = jwt.verify(token, getResetSecret());

    if (payload.purpose !== 'password-reset' || !payload.sub) {
      throw new Error('Propósito de token inválido');
    }

    const [users] = await pool.query(
      `SELECT u.usuario_id, u.password_hash, eu.permite_acceso
       FROM usuarios u
       INNER JOIN estados_usuario eu
         ON eu.estado_usuario_id = u.estado_usuario_id
       WHERE u.usuario_id = ?
       LIMIT 1`,
      [payload.sub]
    );

    if (
      users.length === 0 ||
      !users[0].permite_acceso ||
      payload.passwordVersion !== passwordVersion(users[0].password_hash)
    ) {
      throw new Error('Token revocado');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE usuarios SET password_hash = ? WHERE usuario_id = ?',
      [passwordHash, users[0].usuario_id]
    );

    return res.json({
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    if (
      error.name !== 'JsonWebTokenError' &&
      error.name !== 'TokenExpiredError' &&
      error.message !== 'Token revocado' &&
      error.message !== 'Propósito de token inválido'
    ) {
      console.error('Error al restablecer contraseña:', error);
    }

    return res.status(400).json({
      message:
        'El enlace de recuperación no es válido, ya fue utilizado o expiró.',
    });
  }
};

module.exports = {
  requestPasswordReset,
  resetPassword,
};
