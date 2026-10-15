const { createHash } = require('crypto');
const pool = require('../config/db');
const { getProductAndLots, recordMovement } = require('../utils/inventoryLots');

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};
const text = (value, max, label, required = false) => {
  if (value != null && typeof value !== 'string') fail(`${label} debe ser texto`);
  const result = String(value || '').trim();
  if ((required && !result) || result.length > max) fail(`${label} no es válido (máximo ${max} caracteres)`);
  return result;
};
const id = (value) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) fail('Identificador inválido');
  return result;
};
const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const respondError = (res, error, fallback) => res.status(error.statusCode || 500).json({
  message: error.statusCode ? error.message : fallback,
});
const mapSupplier = (row) => ({
  id: String(row.proveedor_id), name: row.nombre, phone: row.telefono || '',
  email: row.correo || '', address: row.direccion || '', active: Boolean(row.activo),
});
const normalizeSupplier = (body) => {
  const supplier = {
    name: text(body.name, 150, 'Nombre', true),
    phone: text(body.phone, 30, 'Teléfono'),
    email: text(body.email, 150, 'Correo'),
    address: text(body.address, 255, 'Dirección'),
    active: body.active ?? true,
  };
  if (typeof supplier.active !== 'boolean') fail('Estado del proveedor inválido');
  if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(supplier.email)) fail('Correo inválido');
  if (supplier.phone && !/^\d{8,12}$/.test(supplier.phone)) fail('El teléfono debe contener entre 8 y 12 dígitos');
  return supplier;
};

const listarProveedores = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proveedor ORDER BY nombre, proveedor_id');
    res.json(rows.map(mapSupplier));
  } catch (error) { respondError(res, error, 'Error al listar proveedores'); }
};
const guardarProveedor = async (req, res) => {
  try {
    const supplier = normalizeSupplier(req.body);
    const values = [supplier.name, supplier.phone || null, supplier.email || null, supplier.address || null, supplier.active ? 1 : 0];
    if (req.params.id) {
      const supplierId = id(req.params.id);
      const [existing] = await pool.query('SELECT proveedor_id FROM proveedor WHERE proveedor_id = ?', [supplierId]);
      if (!existing.length) fail('Proveedor no encontrado', 404);
      await pool.query('UPDATE proveedor SET nombre = ?, telefono = ?, correo = ?, direccion = ?, activo = ? WHERE proveedor_id = ?', [...values, supplierId]);
      res.json({ message: 'Proveedor actualizado correctamente', id: String(supplierId) });
    } else {
      const [result] = await pool.query('INSERT INTO proveedor (nombre, telefono, correo, direccion, activo) VALUES (?, ?, ?, ?, ?)', values);
      res.status(201).json({ message: 'Proveedor creado correctamente', id: String(result.insertId) });
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe un proveedor con ese nombre' });
    respondError(res, error, 'Error al guardar proveedor');
  }
};

const normalizePurchase = (body) => {
  const purchase = {
    supplierId: id(body.supplierId), date: body.date,
    receipt: text(body.receipt, 100, 'Comprobante'), notes: text(body.notes, 500, 'Observaciones'),
    requestKey: text(body.requestKey, 64, 'Clave de envío', true),
  };
  if (!/^[\w-]{16,64}$/.test(purchase.requestKey)) fail('Clave de envío inválida');
  if (!isDate(purchase.date) || purchase.date > today()) fail('La fecha de recepción debe ser válida y no futura');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) fail('Agregue entre 1 y 200 productos');
  purchase.items = body.items.map((item) => {
    if (!item || typeof item !== 'object') fail('Detalle de compra inválido');
    const quantity = Number(item.quantity);
    const cost = Number(item.unitCost);
    if (item.quantity === '' || item.quantity == null || !Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647) fail('La cantidad debe ser un entero positivo');
    if (item.unitCost === '' || item.unitCost == null || !Number.isFinite(cost) || cost < 0 || cost > 99999999.99 || Math.abs(cost * 100 - Math.round(cost * 100)) > 0.00001) fail('El costo debe ser positivo o cero, con hasta dos decimales');
    const expirationDate = item.expirationDate || '';
    if (expirationDate && (!isDate(expirationDate) || expirationDate < purchase.date)) fail('El vencimiento no puede ser anterior a la recepción');
    return { productId: id(item.productId), quantity, unitCost: cost, lotCode: text(item.lotCode, 80, 'Lote'), expirationDate };
  }).sort((a, b) => a.productId - b.productId);
  purchase.totalCents = purchase.items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitCost * 100), 0);
  if (!Number.isSafeInteger(purchase.totalCents) || purchase.totalCents > 99999999999999) fail('Total de compra fuera del límite permitido');
  return purchase;
};

const listarCompras = async (req, res) => {
  try {
    const where = [], values = [];
    if (req.query.supplierId) { where.push('c.proveedor_id = ?'); values.push(id(req.query.supplierId)); }
    for (const [param, operator] of [['from', '>='], ['to', '<=']]) {
      if (req.query[param]) {
        if (!isDate(req.query[param])) fail('Filtro de fecha inválido');
        where.push(`c.fecha ${operator} ?`); values.push(req.query[param]);
      }
    }
    const [rows] = await pool.query(`SELECT c.*, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
      CONCAT_WS(' ', u.primer_nombre, u.segundo_nombre, u.primer_apellido, u.segundo_apellido) AS responsable
      FROM compra_inventario c LEFT JOIN usuario u ON u.usuario_id = c.usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.fecha DESC, c.compra_id DESC`, values);
    if (!rows.length) return res.json([]);
    const [details] = await pool.query(`SELECT d.*, l.codigo_lote,
      DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d') AS vencimiento
      FROM compra_inventario_detalle d JOIN lote_producto l ON l.producto_lote_id = d.producto_lote_id
      WHERE d.compra_id IN (?) ORDER BY d.detalle_id`, [rows.map((row) => row.compra_id)]);
    res.json(rows.map((row) => ({
      id: String(row.compra_id), supplierId: String(row.proveedor_id), supplierName: row.proveedor_nombre,
      date: row.fecha, receipt: row.comprobante || '', notes: row.observaciones || '',
      total: Number(row.total), canceled: Boolean(row.anulada), cancellationReason: row.motivo_anulacion || '',
      responsible: row.responsable || 'Sin responsable registrado',
      items: details.filter((detail) => String(detail.compra_id) === String(row.compra_id)).map((detail) => ({
        id: String(detail.detalle_id), productId: String(detail.producto_id), productName: detail.producto_nombre,
        lotId: String(detail.producto_lote_id), lotCode: detail.codigo_lote || '', expirationDate: detail.vencimiento || '',
        quantity: Number(detail.cantidad), unitCost: Number(detail.costo_unitario),
      })),
    })));
  } catch (error) { respondError(res, error, 'Error al listar compras'); }
};

const crearCompra = async (req, res) => {
  let connection;
  let purchase, hash;
  try {
    purchase = normalizePurchase(req.body);
    hash = createHash('sha256').update(JSON.stringify(purchase)).digest('hex');
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT compra_id, contenido_hash, usuario_id FROM compra_inventario WHERE clave_envio = ?', [purchase.requestKey]);
    if (existing.length) {
      if (existing[0].contenido_hash !== hash || String(existing[0].usuario_id) !== String(req.user.id)) fail('Esta recepción ya se registró con otros datos. Consulte Compras antes de enviar otra recepción', 409);
      await connection.commit();
      return res.json({ id: String(existing[0].compra_id), message: 'Esta compra ya fue registrada; no se duplicaron las existencias' });
    }
    const [suppliers] = await connection.query('SELECT proveedor_id, nombre, activo FROM proveedor WHERE proveedor_id = ? FOR UPDATE', [purchase.supplierId]);
    if (!suppliers.length || !suppliers[0].activo) fail('Seleccione un proveedor activo');
    const [result] = await connection.query(`INSERT INTO compra_inventario
      (proveedor_id, proveedor_nombre, fecha, comprobante, observaciones, usuario_id, clave_envio, contenido_hash, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [purchase.supplierId, suppliers[0].nombre, purchase.date,
      purchase.receipt || null, purchase.notes || null, req.user.id, purchase.requestKey, hash, purchase.totalCents / 100]);
    const purchaseId = result.insertId;
    // Product locks are acquired in a stable order, shared with sales and audits.
    for (const [index, item] of purchase.items.entries()) {
      const inventory = await getProductAndLots(connection, item.productId);
      if (!inventory.product.activo) fail('No se pueden recibir productos inactivos');
      if (inventory.stock + item.quantity > 2147483647) fail('La existencia excede el límite permitido');
      const [lot] = await connection.query(`INSERT INTO lote_producto
        (producto_id, proveedor_id, codigo_lote, fecha_vencimiento, precio_compra, stock)
        VALUES (?, ?, ?, ?, ?, ?)`, [item.productId, purchase.supplierId, item.lotCode || `COMPRA-${purchaseId}-${index + 1}`,
        item.expirationDate || null, item.unitCost, item.quantity]);
      await connection.query(`INSERT INTO compra_inventario_detalle
        (compra_id, producto_id, producto_nombre, producto_lote_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?, ?, ?)`,
      [purchaseId, item.productId, inventory.product.nombre, lot.insertId, item.quantity, item.unitCost]);
      await recordMovement({ connection, productId: item.productId, lotId: lot.insertId, userId: req.user.id,
        movementType: 'Entrada', quantity: item.quantity, previousStock: inventory.stock,
        newStock: inventory.stock + item.quantity, reason: `Recepción de compra #${purchaseId}`,
        referenceType: 'Compra', referenceId: purchaseId });
    }
    await connection.commit();
    res.status(201).json({ id: String(purchaseId), message: 'Compra recibida y existencias actualizadas correctamente' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY' && purchase) {
      const [rows] = await pool.query('SELECT compra_id, contenido_hash, usuario_id FROM compra_inventario WHERE clave_envio = ?', [purchase.requestKey]);
      if (rows.length && rows[0].contenido_hash === hash && String(rows[0].usuario_id) === String(req.user.id)) {
        return res.json({ id: String(rows[0].compra_id), message: 'Esta compra ya fue registrada; no se duplicaron las existencias' });
      }
      return res.status(409).json({ message: 'Esta recepción ya se registró con otros datos. Consulte Compras antes de enviar otra recepción' });
    }
    respondError(res, error, 'Error al recibir la compra');
  } finally { connection?.release(); }
};

const anularCompra = async (req, res) => {
  let connection;
  try {
    const purchaseId = id(req.params.id);
    const reason = text(req.body.reason, 200, 'Motivo de anulación', true);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [purchases] = await connection.query('SELECT compra_id, anulada FROM compra_inventario WHERE compra_id = ? FOR UPDATE', [purchaseId]);
    if (!purchases.length) fail('Compra no encontrada', 404);
    if (purchases[0].anulada) fail('La compra ya fue anulada', 409);
    const [details] = await connection.query('SELECT * FROM compra_inventario_detalle WHERE compra_id = ? ORDER BY producto_id, detalle_id', [purchaseId]);
    for (const item of details) {
      const inventory = await getProductAndLots(connection, item.producto_id);
      const lot = inventory.lots.find((candidate) => Number(candidate.producto_lote_id) === Number(item.producto_lote_id));
      const quantity = Number(item.cantidad);
      if (!lot || Number(lot.stock) < quantity) fail('No se puede anular: las unidades de la compra ya no están disponibles en sus lotes', 409);
      await connection.query('UPDATE lote_producto SET stock = stock - ? WHERE producto_lote_id = ?', [quantity, item.producto_lote_id]);
      await recordMovement({ connection, productId: item.producto_id, lotId: item.producto_lote_id, userId: req.user.id,
        movementType: 'Salida', quantity, previousStock: inventory.stock, newStock: inventory.stock - quantity,
        reason: `Anulación de compra #${purchaseId}: ${reason}`, referenceType: 'Compra', referenceId: purchaseId });
    }
    await connection.query('UPDATE compra_inventario SET anulada = 1, motivo_anulacion = ?, anulada_por = ?, anulada_en = NOW() WHERE compra_id = ?', [reason, req.user.id, purchaseId]);
    await connection.commit();
    res.json({ message: 'Compra anulada; se conservaron el documento y sus movimientos' });
  } catch (error) {
    if (connection) await connection.rollback();
    respondError(res, error, 'Error al anular la compra');
  } finally { connection?.release(); }
};

const listarMovimientos = async (req, res) => {
  try {
    const where = [], values = [];
    if (req.query.productId) { where.push('m.producto_id = ?'); values.push(id(req.query.productId)); }
    if (req.query.origin) {
      if (!['Manual', 'Receta', 'Venta', 'Compra', 'Corrección', 'Grooming', 'Historico'].includes(req.query.origin)) fail('Origen inválido');
      if (req.query.origin === 'Historico') where.push("m.referencia_tipo = 'Compra' AND c.compra_id IS NULL");
      else { where.push('m.referencia_tipo = ?'); values.push(req.query.origin); }
    }
    for (const [param, operator] of [['from', '>='], ['to', '<=']]) {
      if (req.query[param]) {
        if (!isDate(req.query[param])) fail('Filtro de fecha inválido');
        where.push(`m.creado_en ${operator} ?`);
        values.push(`${req.query[param]} ${param === 'to' ? '23:59:59' : '00:00:00'}`);
      }
    }
    const page = req.query.page === undefined ? 1 : id(req.query.page);
    const joins = `FROM movimiento_inventario m
      JOIN producto_inventario p ON p.producto_id = m.producto_id
      LEFT JOIN lote_producto l ON l.producto_lote_id = m.producto_lote_id
      LEFT JOIN usuario u ON u.usuario_id = m.usuario_id
      LEFT JOIN compra_inventario c ON m.referencia_tipo = 'Compra' AND c.compra_id = m.referencia_id
      LEFT JOIN cierre_venta v ON m.referencia_tipo = 'Venta' AND v.venta_id = m.referencia_id
      LEFT JOIN receta r ON m.referencia_tipo = 'Receta' AND r.receta_id = m.referencia_id
      LEFT JOIN auditoria_inventario a ON m.referencia_tipo = 'Corrección' AND a.auditoria_inventario_id = m.referencia_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total ${joins}`, values);
    const [rows] = await pool.query(`SELECT m.*, p.nombre AS producto, l.codigo_lote,
      DATE_FORMAT(m.creado_en, '%Y-%m-%d %H:%i:%s') AS fecha,
      CONCAT_WS(' ', u.primer_nombre, u.segundo_nombre, u.primer_apellido, u.segundo_apellido) AS responsable,
      c.compra_id, c.comprobante, v.venta_id, r.receta_id, a.codigo AS auditoria_codigo
      ${joins} ORDER BY m.movimiento_id DESC LIMIT 50 OFFSET ?`, [...values, (page - 1) * 50]);
    res.json({ total: Number(count.total), page, pageSize: 50, items: rows.map((row) => {
      let document = row.referencia_id ? `${row.referencia_tipo} #${row.referencia_id}` : 'Movimiento manual';
      if (row.referencia_tipo === 'Compra') document = row.compra_id ? `Compra #${row.compra_id}${row.comprobante ? ` · ${row.comprobante}` : ''}` : 'Histórico / saldo previo sin documento';
      if (row.referencia_tipo === 'Venta' && !row.venta_id) document += ' · documento histórico no disponible';
      if (row.referencia_tipo === 'Receta' && !row.receta_id) document += ' · documento histórico no disponible';
      if (row.auditoria_codigo) document = row.auditoria_codigo;
      return { id: String(row.movimiento_id), productId: String(row.producto_id), productName: row.producto,
        date: row.fecha, type: row.tipo_movimiento, quantity: Number(row.cantidad),
        previousStock: Number(row.stock_anterior), newStock: Number(row.stock_nuevo),
        lotCode: row.codigo_lote || '', responsible: row.responsable || 'Sin responsable registrado',
        reason: row.motivo, origin: row.referencia_tipo, document,
        referenceId: row.referencia_id ? String(row.referencia_id) : '',
      };
    }) });
  } catch (error) { respondError(res, error, 'Error al listar movimientos'); }
};

module.exports = { listarProveedores, guardarProveedor, listarCompras, crearCompra, anularCompra, listarMovimientos, normalizePurchase };
