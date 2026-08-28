const pool = require('../config/db');

const ACTION_COLUMNS = {
  ver: 'puede_ver',
  crear: 'puede_crear',
  editar: 'puede_editar',
  eliminar: 'puede_eliminar',
};

const verificarPermiso = (moduleCode, action = 'ver') => {
  const actionColumn = ACTION_COLUMNS[action];
  if (!actionColumn) throw new Error(`Acción de permiso no válida: ${action}`);

  return async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT rp.${actionColumn} AS permitido
        FROM usuarios u
        INNER JOIN estados_usuario eu
          ON eu.estado_usuario_id = u.estado_usuario_id
        INNER JOIN rol_permisos rp ON rp.rol_id = u.rol_id
        INNER JOIN modulos_sistema m ON m.modulo_id = rp.modulo_id
        WHERE u.usuario_id = ?
          AND eu.permite_acceso = 1
          AND m.codigo = ?
          AND m.activo = 1
        LIMIT 1
        `,
        [req.user?.id, moduleCode]
      );

      if (rows.length === 0 || !rows[0].permitido) {
        return res.status(403).json({
          message: 'No tiene permisos para realizar esta acción',
        });
      }
      next();
    } catch (error) {
      res.status(500).json({
        message: 'Error al validar permisos',
        error: error.message,
      });
    }
  };
};

module.exports = { verificarPermiso };
