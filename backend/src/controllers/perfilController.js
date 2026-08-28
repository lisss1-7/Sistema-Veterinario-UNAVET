const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const {
  areValidNameParts,
  getUserNameParts,
} = require('../utils/personName');
const {
  syncVeterinarianForUser,
} = require('../utils/veterinarian');
const {
  specialtiesSelect,
  syncUserSpecialties,
} = require('../utils/userSpecialties');

const mapUsuarioToFrontend = (row) => ({
  id: row.usuario_id,
  firstName: row.primer_nombre,
  middleName: row.segundo_nombre || '',
  firstSurname: row.primer_apellido || '',
  secondSurname: row.segundo_apellido || '',
  name: row.nombre_completo,
  email: row.correo,
  role: row.rol,
  phone: row.telefono || '',
  specialty: row.especialidad || '',
  status: row.estado,
  lastAccess: row.ultimo_acceso,
  creationDate: row.creado_en,
});

const obtenerPerfil = async (req, res) => {
  try {
    const [rows] = await pool.query(
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
        estado.nombre AS estado,
        u.ultimo_acceso,
        u.creado_en,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario estado
        ON estado.estado_usuario_id = u.estado_usuario_id
      WHERE u.usuario_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Perfil no encontrado',
      });
    }

    res.json(mapUsuarioToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener perfil',
      error: error.message,
    });
  }
};

const actualizarPerfil = async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      firstSurname,
      secondSurname,
      phone,
      specialty,
    } = req.body;

    const nameParts = getUserNameParts(req.body);

    if (!areValidNameParts(nameParts) || !phone) {
      return res.status(400).json({
        message: 'Nombre y teléfono son obligatorios',
      });
    }

    const [result] = await pool.query(
      `
      UPDATE usuarios
      SET
        primer_nombre = ?,
        segundo_nombre = ?,
        primer_apellido = ?,
        segundo_apellido = ?,
        telefono = ?
      WHERE usuario_id = ?
      `,
      [
        firstName,
        middleName || null,
        firstSurname,
        secondSurname || null,
        phone,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    await syncUserSpecialties(
      pool,
      req.user.id,
      req.body.specialties || specialty
    );
    await syncVeterinarianForUser(pool, req.user.id);

    const [rows] = await pool.query(
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
        estado.nombre AS estado,
        u.ultimo_acceso,
        u.creado_en,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario estado
        ON estado.estado_usuario_id = u.estado_usuario_id
      WHERE u.usuario_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    res.json({
      message: 'Perfil actualizado correctamente',
      user: mapUsuarioToFrontend(rows[0]),
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar perfil',
      error: error.message,
    });
  }
};

const cambiarPassword = async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Debe completar todos los campos de contraseña',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: 'La nueva contraseña y la confirmación no coinciden',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'La nueva contraseña debe tener al menos 8 caracteres',
      });
    }

    const [rows] = await pool.query(
      `
      SELECT usuario_id, password_hash
      FROM usuarios
      WHERE usuario_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    const passwordCorrecta = await bcrypt.compare(
      currentPassword,
      rows[0].password_hash
    );

    if (!passwordCorrecta) {
      return res.status(401).json({
        message: 'La contraseña actual no es correcta',
      });
    }

    const nuevoHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `
      UPDATE usuarios
      SET password_hash = ?
      WHERE usuario_id = ?
      `,
      [nuevoHash, req.user.id]
    );

    res.json({
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al cambiar contraseña',
      error: error.message,
    });
  }
};

module.exports = {
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
};
