// Use the caller's transaction so the product and its attribution commit together.
const recordProductChange = async (connection, req, productId, action, description) => {
  await connection.query(
    `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, descripcion, ip)
     VALUES (?, ?, 'producto_inventario', ?, ?, ?)`,
    [req.user?.id || null, action, productId, description, req.ip || null]
  );
};

module.exports = { recordProductChange };
