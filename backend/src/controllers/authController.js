const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  specialtiesSelect,
} = require('../utils/userSpecialties');

const login = async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({
        message: 'Correo y contraseña son obligatorios',
      });
    }

    const [users] = await pool.query(
      `
      SELECT 
        u.usuario_id,
        u.primer_nombre,
        u.segundo_nombre,
        u.primer_apellido,
        u.segundo_apellido,
        CONCAT_WS(' ', u.primer_nombre, u.segundo_nombre,
          u.primer_apellido, u.segundo_apellido) AS nombre_completo,
        u.correo,
        u.telefono,
        ${specialtiesSelect('u')},
        u.password_hash,
        eu.nombre AS estado,
        eu.permite_acceso,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario eu
        ON eu.estado_usuario_id = u.estado_usuario_id
      WHERE u.correo = ?
      LIMIT 1
      `,
      [correo]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: 'Correo o contraseña incorrectos',
      });
    }

    const user = users[0];

    if (!user.permite_acceso) {
      return res.status(403).json({
        message: 'El usuario está inactivo',
      });
    }

    const passwordValida = await bcrypt.compare(password, user.password_hash);

    if (!passwordValida) {
      return res.status(401).json({
        message: 'Correo o contraseña incorrectos',
      });
    }

    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE usuario_id = ?',
      [user.usuario_id]
    );

    const token = jwt.sign(
      {
        id: user.usuario_id,
        correo: user.correo,
        rol: user.rol,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Inicio de sesión correcto',
      token,
      user: {
        id: user.usuario_id,
        firstName: user.primer_nombre,
        middleName: user.segundo_nombre || '',
        firstSurname: user.primer_apellido || '',
        secondSurname: user.segundo_apellido || '',
        name: user.nombre_completo,
        email: user.correo,
        role: user.rol,
        phone: user.telefono,
        specialty: user.especialidad,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);

    res.status(500).json({
      message: 'Error interno al iniciar sesión',
      error: error.message,
    });
  }
};

module.exports = {
  login,
};
