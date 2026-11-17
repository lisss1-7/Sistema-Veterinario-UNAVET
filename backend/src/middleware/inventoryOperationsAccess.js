const pool = require('../config/db');

// Resolve the authenticated account in MySQL; never trust a browser name or JWT role.
const tieneAccesoOperaciones = async (userId) => {
  if (!userId) return false;
  const [rows] = await pool.query(
    `SELECT u.usuario_id FROM usuario u
     INNER JOIN estado_usuario eu ON eu.estado_usuario_id = u.estado_usuario_id
     WHERE u.usuario_id = ? AND BINARY u.correo = BINARY ?
       AND u.eliminado_en IS NULL AND eu.permite_acceso = 1 LIMIT 1`,
    [userId, 'admin']
  );
  return rows.length === 1;
};

const verificarAdminInventario = async (req, res, next) => {
  try {
    if (!(await tieneAccesoOperaciones(req.user?.id))) {
      return res.status(403).json({ message: 'Este apartado está disponible únicamente para la cuenta autorizada' });
    }
    next();
  } catch {
    res.status(500).json({ message: 'No fue posible validar el acceso a operaciones de inventario' });
  }
};

const consultarAccesoOperaciones = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json({ canAccessOperations: await tieneAccesoOperaciones(req.user?.id) });
  } catch {
    res.status(500).json({ message: 'No fue posible validar el acceso a operaciones de inventario' });
  }
};

module.exports = { verificarAdminInventario, consultarAccesoOperaciones };
