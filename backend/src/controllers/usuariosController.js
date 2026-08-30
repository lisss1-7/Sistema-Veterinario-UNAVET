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
  id: String(row.usuario_id),
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
  lastAccess: row.ultimo_acceso || null,
  creationDate: row.fecha_creacion,
});

const obtenerRolId = async (connection, roleName) => {
  const [rows] = await connection.query(
    `
    SELECT rol_id
    FROM roles
    WHERE nombre = ? AND activo = 1
    LIMIT 1
    `,
    [roleName]
  );

  return rows[0]?.rol_id || null;
};

const obtenerEstadoUsuario = async (connection, status) => {
  const [rows] = await connection.query(
    `
    SELECT estado_usuario_id, nombre
    FROM estados_usuario
    WHERE activo = 1
      AND (? IS NULL OR nombre = ?)
    ORDER BY permite_acceso DESC, estado_usuario_id
    LIMIT 1
    `,
    [status || null, status || null]
  );
  return rows[0] || null;
};

const listarUsuarios = async (req, res) => {
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
        DATE_FORMAT(u.creado_en, '%Y-%m-%d') AS fecha_creacion,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario estado
        ON estado.estado_usuario_id = u.estado_usuario_id
      ORDER BY u.usuario_id ASC
      `
    );

    res.json(rows.map(mapUsuarioToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar usuarios',
      error: error.message,
    });
  }
};

const obtenerUsuarioPorId = async (req, res) => {
  try {
    const { id } = req.params;

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
        DATE_FORMAT(u.creado_en, '%Y-%m-%d') AS fecha_creacion,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario estado
        ON estado.estado_usuario_id = u.estado_usuario_id
      WHERE u.usuario_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    res.json(mapUsuarioToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener usuario',
      error: error.message,
    });
  }
};

const crearUsuario = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      firstName,
      middleName,
      firstSurname,
      secondSurname,
      email,
      role,
      phone,
      specialty,
      password,
      status,
    } = req.body;

    const nameParts = getUserNameParts(req.body);

    if (
      !areValidNameParts(nameParts) ||
      !email || !role || !phone || !password
    ) {
      return res.status(400).json({
        message: 'Nombre, correo, rol, teléfono y contraseña son obligatorios',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'La contraseña debe tener al menos 8 caracteres',
      });
    }

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT usuario_id FROM usuarios WHERE correo = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        message: 'Ya existe un usuario registrado con ese correo',
      });
    }

    const rolId = await obtenerRolId(connection, role);
    const finalStatus = await obtenerEstadoUsuario(connection, status);

    if (!rolId || !finalStatus) {
      await connection.rollback();

      return res.status(400).json({
        message: 'El rol seleccionado no existe',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      `
      INSERT INTO usuarios (
        rol_id,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        correo,
        telefono,
        password_hash,
        estado_usuario_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        rolId,
        firstName,
        middleName || null,
        firstSurname,
        secondSurname || null,
        email,
        phone,
        passwordHash,
        finalStatus.estado_usuario_id,
      ]
    );

    await syncUserSpecialties(
      connection,
      result.insertId,
      req.body.specialties || specialty
    );
    await syncVeterinarianForUser(connection, result.insertId, role);
    await connection.commit();

    res.status(201).json({
      message: 'Usuario creado correctamente',
      id: String(result.insertId),
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al crear usuario',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const actualizarUsuario = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const {
      firstName,
      middleName,
      firstSurname,
      secondSurname,
      email,
      role,
      phone,
      specialty,
      password,
      status,
    } = req.body;

    const nameParts = getUserNameParts(req.body);

    if (!areValidNameParts(nameParts) || !email || !role || !phone) {
      return res.status(400).json({
        message: 'Nombre, correo, rol y teléfono son obligatorios',
      });
    }

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT usuario_id FROM usuarios WHERE usuario_id = ? LIMIT 1',
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    const [emailRows] = await connection.query(
      `
      SELECT usuario_id
      FROM usuarios
      WHERE correo = ? AND usuario_id <> ?
      LIMIT 1
      `,
      [email, id]
    );

    if (emailRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        message: 'Ya existe otro usuario registrado con ese correo',
      });
    }

    const rolId = await obtenerRolId(connection, role);
    const finalStatus = await obtenerEstadoUsuario(connection, status);

    if (!rolId || !finalStatus) {
      await connection.rollback();

      return res.status(400).json({
        message: 'El rol seleccionado no existe',
      });
    }

    if (password) {
      if (password.length < 8) {
        await connection.rollback();

        return res.status(400).json({
          message: 'La contraseña debe tener al menos 8 caracteres',
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await connection.query(
        `
        UPDATE usuarios
        SET
          rol_id = ?,
          primer_nombre = ?,
          segundo_nombre = ?,
          primer_apellido = ?,
          segundo_apellido = ?,
          correo = ?,
          telefono = ?,
          password_hash = ?,
          estado_usuario_id = ?
        WHERE usuario_id = ?
        `,
        [
          rolId,
          firstName,
          middleName || null,
          firstSurname,
          secondSurname || null,
          email,
          phone,
          passwordHash,
          finalStatus.estado_usuario_id,
          id,
        ]
      );
    } else {
      await connection.query(
        `
        UPDATE usuarios
        SET
          rol_id = ?,
          primer_nombre = ?,
          segundo_nombre = ?,
          primer_apellido = ?,
          segundo_apellido = ?,
          correo = ?,
          telefono = ?,
          estado_usuario_id = ?
        WHERE usuario_id = ?
        `,
        [
          rolId,
          firstName,
          middleName || null,
          firstSurname,
          secondSurname || null,
          email,
          phone,
          finalStatus.estado_usuario_id,
          id,
        ]
      );
    }

    await syncUserSpecialties(
      connection,
      id,
      req.body.specialties || specialty
    );
    await syncVeterinarianForUser(connection, id, role);

    const [updatedRows] = await connection.query(
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
        DATE_FORMAT(u.creado_en, '%Y-%m-%d') AS fecha_creacion,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON u.rol_id = r.rol_id
      INNER JOIN estados_usuario estado
        ON estado.estado_usuario_id = u.estado_usuario_id
      WHERE u.usuario_id = ?
      LIMIT 1
      `,
      [id]
    );

    await connection.commit();

    res.json({
      message: 'Usuario actualizado correctamente',
      user: mapUsuarioToFrontend(updatedRows[0]),
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al actualizar usuario',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const cambiarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const [validStatuses] = await pool.query(
      'SELECT estado_usuario_id, permite_acceso FROM estados_usuario WHERE nombre = ? AND activo = 1 LIMIT 1',
      [status]
    );
    if (validStatuses.length === 0) {
      return res.status(400).json({
        message: 'Estado inválido',
      });
    }

    if (
      String(req.user?.id) === String(id) &&
      !validStatuses[0].permite_acceso
    ) {
      return res.status(400).json({
        message: 'No puedes inactivar tu propio usuario mientras estás en sesión',
      });
    }

    const [result] = await pool.query(
      'UPDATE usuarios SET estado_usuario_id = ? WHERE usuario_id = ?',
      [validStatuses[0].estado_usuario_id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }
    res.json({
      message: 'Estado actualizado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al cambiar estado de usuario',
      error: error.message,
    });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user?.id) === String(id)) {
      return res.status(400).json({
        message: 'No puedes eliminar tu propio usuario mientras estás en sesión',
      });
    }

    const [result] = await pool.query(
      'DELETE FROM usuarios WHERE usuario_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Usuario no encontrado',
      });
    }

    res.json({
      message: 'Usuario eliminado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al eliminar usuario',
      error: error.message,
    });
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
};
