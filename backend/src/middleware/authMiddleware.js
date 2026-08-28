const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const match =
    typeof authHeader === 'string'
      ? authHeader.match(/^Bearer\s+(.+)$/i)
      : null;

  if (!match?.[1]) {
    return res.status(401).json({
      message: authHeader ? 'Token inválido' : 'Token no proporcionado',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(match[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      message: 'Token no válido o expirado',
    });
  }

  try {
    const [users] = await pool.query(
      `
      SELECT
        u.usuario_id,
        r.nombre AS rol,
        eu.permite_acceso
      FROM usuarios u
      INNER JOIN roles r ON r.rol_id = u.rol_id
      INNER JOIN estados_usuario eu
        ON eu.estado_usuario_id = u.estado_usuario_id
      WHERE u.usuario_id = ?
      LIMIT 1
      `,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: 'El usuario asociado al token ya no existe',
      });
    }

    if (!users[0].permite_acceso) {
      return res.status(403).json({
        message: 'El usuario está inactivo',
      });
    }

    req.user = {
      ...decoded,
      rol: users[0].rol,
    };

    next();
  } catch (error) {
    console.error('Error al validar la sesión activa:', error);
    return res.status(500).json({
      message: 'No fue posible validar la sesión',
    });
  }
};

module.exports = {
  verificarToken,
};
