const pool = require('../config/db');

const ACTIONS = ['CREAR_PRODUCTO', 'EDITAR_PRODUCTO', 'INACTIVAR_PRODUCTO', 'Entrada', 'Salida', 'Ajuste'];
const PAGE_SIZE = 50;

const invalidFilter = () => {
  const error = new Error('Filtros de historial inválidos');
  error.statusCode = 400;
  throw error;
};
const positiveInteger = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalidFilter();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) invalidFilter();
  return number;
};
const dateBoundary = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalidFilter();
  const timestamp = Date.parse(`${value}T00:00:00-06:00`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) invalidFilter();
  return timestamp;
};

const listarHistorial = async (req, res) => {
  try {
    const where = [], values = [];
    const { productId, action, from, to } = req.query;
    const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page);
    if (!Number.isSafeInteger((page - 1) * PAGE_SIZE)) invalidFilter();
    if (productId !== undefined) { where.push('h.producto_id = ?'); values.push(positiveInteger(productId)); }
    if (action !== undefined) {
      if (!ACTIONS.includes(action)) invalidFilter();
      where.push('h.accion = ?'); values.push(action);
    }
    if (from !== undefined) { where.push('h.fecha_ms >= ?'); values.push(dateBoundary(from)); }
    if (to !== undefined) { where.push('h.fecha_ms < ?'); values.push(dateBoundary(to) + 86400000); }
    if (from !== undefined && to !== undefined && from > to) invalidFilter();

    // Stock already records its author in movimiento_inventario. Keep that history
    // alongside product changes without duplicating movements or inventing old authors.
    const history = `FROM (
      SELECT a.auditoria_id AS evento_id, 'producto' AS origen, a.entidad_id AS producto_id,
        a.usuario_id, a.accion, a.descripcion,
        UNIX_TIMESTAMP(a.creado_en) * 1000 AS fecha_ms,
        NULL AS cantidad, NULL AS stock_anterior, NULL AS stock_nuevo
      FROM auditoria a
      WHERE a.entidad = 'producto_inventario'
        AND a.accion IN ('CREAR_PRODUCTO', 'EDITAR_PRODUCTO', 'INACTIVAR_PRODUCTO')
      UNION ALL
      SELECT m.movimiento_id, 'movimiento', m.producto_id,
        m.usuario_id, m.tipo_movimiento, m.motivo,
        UNIX_TIMESTAMP(m.creado_en) * 1000,
        m.cantidad, m.stock_anterior, m.stock_nuevo
      FROM movimiento_inventario m
    ) h
    LEFT JOIN producto_inventario p ON p.producto_id = h.producto_id
    LEFT JOIN usuario u ON u.usuario_id = h.usuario_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total ${history}`, values);
    const [rows] = await pool.query(`SELECT h.*, p.nombre AS producto,
      TRIM(CONCAT_WS(' ', u.primer_nombre, u.segundo_nombre, u.primer_apellido, u.segundo_apellido)) AS responsable
      ${history}
      ORDER BY h.fecha_ms DESC, h.evento_id DESC, h.origen DESC
      LIMIT ${PAGE_SIZE} OFFSET ?`, [...values, (page - 1) * PAGE_SIZE]);
    res.json({ total: Number(count.total), page, pageSize: PAGE_SIZE, items: rows.map((row) => ({
      id: `${row.origen}-${row.evento_id}`,
      productId: String(row.producto_id), productName: row.producto || `Producto #${row.producto_id}`,
      date: new Date(Number(row.fecha_ms)).toISOString(), action: row.accion,
      responsible: row.responsable || 'Sin responsable registrado',
      description: row.descripcion || '',
      quantity: row.cantidad == null ? null : Number(row.cantidad),
      previousStock: row.stock_anterior == null ? null : Number(row.stock_anterior),
      newStock: row.stock_nuevo == null ? null : Number(row.stock_nuevo),
    })) });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'Error al consultar el historial de inventario',
    });
  }
};

module.exports = { listarHistorial };
