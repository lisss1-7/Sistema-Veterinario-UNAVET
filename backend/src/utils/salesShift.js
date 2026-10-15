const mapShift = (row) => ({
  id: String(row.turno_id),
  number: Number(row.numero),
  label: row.nombre || `Turno ${row.numero}`,
  afterSaleId: String(row.desde_venta_id),
  throughSaleId: String(row.hasta_venta_id),
  closedAt: new Date(Number(row.closed_ms)).toISOString(),
  closedBy: row.finalizado_por ? String(row.finalizado_por) : null,
  responsible: row.responsable || 'No disponible',
  summary: typeof row.resumen === 'string' ? JSON.parse(row.resumen) : row.resumen,
});

const listSalesShifts = async (connection, date) => {
  const [rows] = await connection.query(`
    SELECT turno.*, UNIX_TIMESTAMP(turno.finalizado_en) * 1000 AS closed_ms,
      CONCAT_WS(' ', usuario.primer_nombre, usuario.segundo_nombre,
        usuario.primer_apellido, usuario.segundo_apellido) AS responsable
    FROM cierre_venta_turno turno
    LEFT JOIN usuario ON usuario.usuario_id = turno.finalizado_por
    WHERE turno.fecha = ? ORDER BY turno.numero`, [date]);
  return rows.map(mapShift);
};

// Todas las operaciones usan el bloqueo existente del día. Los límites por
// venta_id separan turnos sin alterar ni reasignar las ventas anteriores.
const closeSalesShift = async (connection, { date, userId, expectedNumber, label, onlyIfPending = false }) => {
  const [previous] = await connection.query(`
    SELECT numero, hasta_venta_id FROM cierre_venta_turno
    WHERE fecha = ? ORDER BY numero DESC LIMIT 1`, [date]);
  const latest = previous[0];
  const number = Number(latest?.numero || 0) + 1;
  if (expectedNumber !== undefined && expectedNumber !== number) {
    throw Object.assign(new Error('Este turno ya cambió o fue cerrado. Actualice la lista antes de continuar.'), { statusCode: 409 });
  }
  const afterSaleId = latest?.hasta_venta_id || 0;
  const [bounds] = await connection.query(`
    SELECT COALESCE(MAX(venta_id), 0) AS hasta_venta_id
    FROM cierre_venta WHERE fecha = ?`, [date]);
  const throughSaleId = String(Math.max(Number(bounds[0]?.hasta_venta_id || 0), Number(afterSaleId)));
  if (onlyIfPending && latest && String(throughSaleId) === String(afterSaleId)) return null;

  // Algunas instalaciones anteriores todavía no tienen anulación lógica.
  const [columns] = await connection.query(`
    SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cierre_venta' AND COLUMN_NAME = 'anulada' LIMIT 1`);
  const activeCondition = columns.length ? 'AND COALESCE(venta.anulada, 0) = 0' : '';
  const values = [date, afterSaleId, throughSaleId];
  const [totals] = await connection.query(`
    SELECT COUNT(DISTINCT venta.venta_id) AS sale_count,
      COALESCE(SUM(detalle.subtotal), 0) AS total,
      COALESCE(SUM(CASE WHEN detalle.tipo = 'Producto' THEN detalle.cantidad ELSE 0 END), 0) AS product_quantity
    FROM cierre_venta venta
    LEFT JOIN cierre_venta_detalle detalle ON detalle.venta_id = venta.venta_id
    WHERE venta.fecha = ? AND venta.venta_id > ? AND venta.venta_id <= ? ${activeCondition}`, values);
  const [payments] = await connection.query(`
    SELECT forma.codigo, forma.nombre, SUM(pago.monto) AS amount
    FROM venta_pago pago
    INNER JOIN cierre_venta venta ON venta.venta_id = pago.venta_id
    INNER JOIN forma_pago forma ON forma.forma_pago_id = pago.forma_pago_id
    WHERE venta.fecha = ? AND venta.venta_id > ? AND venta.venta_id <= ? ${activeCondition}
    GROUP BY forma.forma_pago_id, forma.codigo, forma.nombre ORDER BY forma.orden, forma.nombre`, values);
  const summary = {
    saleCount: Number(totals[0].sale_count), total: Number(totals[0].total),
    productQuantity: Number(totals[0].product_quantity),
    payments: payments.map(row => ({ code: row.codigo, name: row.nombre, amount: Number(row.amount) })),
  };
  const [result] = await connection.query(`
    INSERT INTO cierre_venta_turno
      (fecha, numero, nombre, desde_venta_id, hasta_venta_id, finalizado_por, resumen)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [date, number, label || null, afterSaleId, throughSaleId, userId || null, JSON.stringify(summary)]);
  return { id: String(result.insertId), number, summary };
};

module.exports = { listSalesShifts, closeSalesShift };
