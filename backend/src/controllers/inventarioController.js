const pool = require('../config/db');
const {
  recordMovement,
  consumeLots,
  addToPrimaryLot,
  setTotalStock,
} = require('../utils/inventoryLots');

const PRODUCT_SELECT = `
  SELECT
    producto.producto_id,
    producto.nombre,
    categoria.nombre AS categoria,
    producto.descripcion,
    unidad.nombre AS unidad_medida,
    COALESCE(lotes.stock_actual, 0) AS stock_actual,
    producto.stock_minimo,
    producto.precio_venta,
    DATE_FORMAT(lotes.proximo_vencimiento, '%Y-%m-%d')
      AS fecha_vencimiento,
    (
      SELECT proveedor.nombre
      FROM lote_producto lote_proveedor
      LEFT JOIN proveedor proveedor
        ON proveedor.proveedor_id = lote_proveedor.proveedor_id
      WHERE lote_proveedor.producto_id = producto.producto_id
      ORDER BY
        CASE WHEN lote_proveedor.stock > 0 THEN 0 ELSE 1 END,
        CASE
          WHEN lote_proveedor.fecha_vencimiento IS NULL THEN 1
          ELSE 0
        END,
        lote_proveedor.fecha_vencimiento,
        lote_proveedor.producto_lote_id
      LIMIT 1
    ) AS proveedor,
    CASE
      WHEN producto.activo = 0 THEN estado_inactivo.nombre
      WHEN COALESCE(lotes.stock_actual, 0) = 0
        THEN estado_agotado.nombre
      ELSE estado_activo.nombre
    END AS estado
  FROM producto_inventario producto
  INNER JOIN categoria_inventario categoria
    ON categoria.categoria_id = producto.categoria_id
  INNER JOIN unidad_medida unidad
    ON unidad.unidad_medida_id = producto.unidad_medida_id
  INNER JOIN estado_producto estado_activo
    ON estado_activo.es_inicial = 1
   AND estado_activo.activo = 1
  INNER JOIN estado_producto estado_agotado
    ON estado_agotado.sin_existencias = 1
   AND estado_agotado.activo = 1
  INNER JOIN estado_producto estado_inactivo
    ON estado_inactivo.es_inicial = 0
   AND estado_inactivo.sin_existencias = 0
   AND estado_inactivo.activo = 1
  LEFT JOIN (
    SELECT
      producto_id,
      SUM(stock) AS stock_actual,
      MIN(
        CASE WHEN stock > 0 THEN fecha_vencimiento END
      ) AS proximo_vencimiento
    FROM lote_producto
    GROUP BY producto_id
  ) lotes
    ON lotes.producto_id = producto.producto_id
`;

const mapProductoToFrontend = (row) => ({
  id: String(row.producto_id),
  name: row.nombre,
  category: row.categoria,
  description: row.descripcion || '',
  presentation: row.unidad_medida || '',
  currentStock: Number(row.stock_actual || 0),
  minStock: Number(row.stock_minimo || 0),
  price: Number(row.precio_venta || 0),
  expirationDate: row.fecha_vencimiento || '',
  supplier: row.proveedor || '',
  status: row.estado,
});

const getOrCreateCategory = async (connection, name) => {
  const normalizedName = String(name || '').trim();
  await connection.query(
    `INSERT INTO categoria_inventario (
       nombre,
       descripcion,
       activo
     )
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE activo = 1`,
    [normalizedName, `Categoría ${normalizedName}`]
  );
  const [rows] = await connection.query(
    `SELECT categoria_id
     FROM categoria_inventario
     WHERE nombre = ?
     LIMIT 1`,
    [normalizedName]
  );
  return rows[0].categoria_id;
};

const getOrCreateSupplier = async (connection, name) => {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return null;
  await connection.query(
    `INSERT INTO proveedor (nombre, activo)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE activo = 1`,
    [normalizedName]
  );
  const [rows] = await connection.query(
    `SELECT proveedor_id
     FROM proveedor
     WHERE nombre = ?
     LIMIT 1`,
    [normalizedName]
  );
  return rows[0].proveedor_id;
};

const getOrCreateUnit = async (connection, name) => {
  const normalizedName = String(name || '').trim();
  await connection.query(
    `INSERT INTO unidad_medida (nombre, activo)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE activo = 1`,
    [normalizedName]
  );
  const [rows] = await connection.query(
    `SELECT unidad_medida_id
     FROM unidad_medida
     WHERE nombre = ?
     LIMIT 1`,
    [normalizedName]
  );
  return rows[0].unidad_medida_id;
};

const normalizeNumbers = (body) => {
  const stock = Number(body.currentStock);
  const minimum = Number(body.minStock);
  const price = Number(body.price);
  if (
    !Number.isInteger(stock) ||
    stock < 0 ||
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return null;
  }
  return { stock, minimum, price };
};

const normalizeAuditItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const normalized = [];
  const productIds = new Set();

  for (const item of items) {
    const productId = Number(item?.productId);
    const systemStock = Number(item?.systemStock);
    const physicalStock = Number(item?.physicalStock);
    const notes = String(item?.notes || '').trim();

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      productIds.has(productId) ||
      !Number.isInteger(systemStock) ||
      systemStock < 0 ||
      !Number.isInteger(physicalStock) ||
      physicalStock < 0 ||
      notes.length > 500
    ) {
      return null;
    }

    productIds.add(productId);
    normalized.push({ productId, systemStock, physicalStock, notes });
  }

  return normalized.sort((first, second) => first.productId - second.productId);
};

const toMysqlDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = Date.now();
  if (
    date.getTime() > now + 5 * 60 * 1000 ||
    now - date.getTime() > 7 * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  return new Date(Math.min(date.getTime(), now))
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
};

const getGuatemalaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const normalizeAuditDate = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const date = new Date(`${normalized}T12:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized ||
    normalized > getGuatemalaDate()
  ) {
    return null;
  }

  return normalized;
};

const listarProductos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${PRODUCT_SELECT}
       ORDER BY producto.producto_id DESC`
    );
    res.json(rows.map(mapProductoToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar productos de inventario',
      error: error.message,
    });
  }
};

const obtenerProductoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `${PRODUCT_SELECT}
       WHERE producto.producto_id = ?
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Producto no encontrado',
      });
    }
    res.json(mapProductoToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener producto',
      error: error.message,
    });
  }
};

const crearProducto = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      name,
      category,
      description,
      presentation,
      expirationDate,
      supplier,
      status,
    } = req.body;
    if (!name || !category || !presentation) {
      return res.status(400).json({
        message: 'Nombre, categoría y presentación son obligatorios',
      });
    }
    const numbers = normalizeNumbers(req.body);
    if (!numbers) {
      return res.status(400).json({
        message: 'Stock, mínimo y precio deben ser valores válidos',
      });
    }

    await connection.beginTransaction();
    const [categoryId, supplierId, unitId] = await Promise.all([
      getOrCreateCategory(connection, category),
      getOrCreateSupplier(connection, supplier),
      getOrCreateUnit(connection, presentation),
    ]);
    const [result] = await connection.query(
      `INSERT INTO producto_inventario (
         categoria_id,
         nombre,
         descripcion,
         stock_minimo,
         precio_venta,
         unidad_medida_id,
         activo
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryId,
        String(name).trim(),
        description || null,
        numbers.minimum,
        numbers.price,
        unitId,
        status === 'Inactivo' ? 0 : 1,
      ]
    );
    const [lotResult] = await connection.query(
      `INSERT INTO lote_producto (
         producto_id,
         proveedor_id,
         codigo_lote,
         fecha_vencimiento,
         precio_compra,
         stock
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        supplierId,
        `INICIAL-${result.insertId}`,
        expirationDate || null,
        req.body.purchasePrice || null,
        numbers.stock,
      ]
    );
    if (numbers.stock > 0) {
      await recordMovement({
        connection,
        productId: result.insertId,
        lotId: lotResult.insertId,
        userId: req.user?.id,
        movementType: 'Entrada',
        quantity: numbers.stock,
        previousStock: 0,
        newStock: numbers.stock,
        reason: 'Existencia inicial del producto',
        referenceType: 'Compra',
      });
    }
    await connection.commit();
    res.status(201).json({
      message: 'Producto y lote inicial creados correctamente',
      id: String(result.insertId),
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.message || 'Error al crear producto',
    });
  } finally {
    connection.release();
  }
};

const actualizarProducto = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      name,
      category,
      description,
      presentation,
      expirationDate,
      supplier,
      status,
    } = req.body;
    if (!name || !category || !presentation) {
      return res.status(400).json({
        message: 'Nombre, categoría y presentación son obligatorios',
      });
    }
    const numbers = normalizeNumbers(req.body);
    if (!numbers) {
      return res.status(400).json({
        message: 'Stock, mínimo y precio deben ser valores válidos',
      });
    }

    await connection.beginTransaction();
    const [existing] = await connection.query(
      `SELECT producto_id
       FROM producto_inventario
       WHERE producto_id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Producto no encontrado',
      });
    }

    const [categoryId, supplierId, unitId] = await Promise.all([
      getOrCreateCategory(connection, category),
      getOrCreateSupplier(connection, supplier),
      getOrCreateUnit(connection, presentation),
    ]);
    await connection.query(
      `UPDATE producto_inventario
       SET
         categoria_id = ?,
         nombre = ?,
         descripcion = ?,
         stock_minimo = ?,
         precio_venta = ?,
         unidad_medida_id = ?,
         activo = ?
       WHERE producto_id = ?`,
      [
        categoryId,
        String(name).trim(),
        description || null,
        numbers.minimum,
        numbers.price,
        unitId,
        status === 'Inactivo' ? 0 : 1,
        id,
      ]
    );
    await setTotalStock({
      connection,
      productId: id,
      targetStock: numbers.stock,
      supplierId,
      expirationDate: expirationDate || null,
      purchasePrice: req.body.purchasePrice || null,
      userId: req.user?.id,
      reason: 'Ajuste realizado al editar el producto',
    });
    await connection.commit();
    res.json({
      message: 'Producto y existencias actualizados correctamente',
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.message || 'Error al actualizar producto',
    });
  } finally {
    connection.release();
  }
};

const ajustarStock = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const quantity = Number(req.body.adjustment);
    if (!Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({
        message: 'El ajuste debe ser un entero distinto de cero',
      });
    }

    await connection.beginTransaction();
    let newStock;
    if (quantity > 0) {
      newStock = await addToPrimaryLot({
        connection,
        productId: id,
        quantity,
        userId: req.user?.id,
        reason: req.body.reason || 'Ajuste manual de inventario',
      });
    } else {
      const result = await consumeLots({
        connection,
        productId: id,
        quantity: Math.abs(quantity),
        userId: req.user?.id,
        reason: req.body.reason || 'Ajuste manual de inventario',
        referenceType: 'Manual',
        referenceId: null,
      });
      newStock = result.newStock;
    }
    await connection.commit();
    res.json({
      message: 'Stock por lotes actualizado correctamente',
      stock: newStock,
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.message || 'Error al ajustar stock',
    });
  } finally {
    connection.release();
  }
};

const finalizarAuditoria = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const items = normalizeAuditItems(req.body?.items);
    const startedAt = toMysqlDateTime(req.body?.startedAt);
    const auditDate = normalizeAuditDate(req.body?.auditDate);

    if (!items || !startedAt || !auditDate) {
      return res.status(400).json({
        message:
          'La auditoría debe incluir una fecha válida y el conteo físico de cada producto activo',
      });
    }

    await connection.beginTransaction();

    const [products] = await connection.query(
      `SELECT
         producto.producto_id,
         producto.nombre,
         categoria.nombre AS categoria,
         unidad.nombre AS unidad_medida
       FROM producto_inventario producto
       INNER JOIN categoria_inventario categoria
         ON categoria.categoria_id = producto.categoria_id
       INNER JOIN unidad_medida unidad
         ON unidad.unidad_medida_id = producto.unidad_medida_id
       WHERE producto.activo = 1
       ORDER BY producto.producto_id
       FOR UPDATE`
    );

    if (products.length === 0) {
      const error = new Error('No hay productos activos para auditar');
      error.statusCode = 400;
      throw error;
    }

    const currentIds = products.map((product) => Number(product.producto_id));
    const submittedIds = items.map((item) => item.productId);
    if (
      currentIds.length !== submittedIds.length ||
      currentIds.some((productId, index) => productId !== submittedIds[index])
    ) {
      const error = new Error(
        'El inventario cambió desde que inició el conteo. Reinicie la auditoría para incluir todos los productos activos.'
      );
      error.statusCode = 409;
      throw error;
    }

    const [lots] = await connection.query(
      `SELECT producto_lote_id, producto_id, stock
       FROM lote_producto
       WHERE producto_id IN (?)
       ORDER BY producto_id, producto_lote_id
       FOR UPDATE`,
      [currentIds]
    );

    const stockByProduct = lots.reduce((result, lot) => {
      const productId = Number(lot.producto_id);
      result.set(productId, (result.get(productId) || 0) + Number(lot.stock || 0));
      return result;
    }, new Map());

    const staleItem = items.find(
      (item) => item.systemStock !== (stockByProduct.get(item.productId) || 0)
    );
    if (staleItem) {
      const product = products.find(
        (candidate) => Number(candidate.producto_id) === staleItem.productId
      );
      const error = new Error(
        `El stock de ${product?.nombre || 'un producto'} cambió durante el conteo. Reinicie la auditoría antes de finalizar.`
      );
      error.statusCode = 409;
      throw error;
    }

    const differences = items.filter(
      (item) => item.physicalStock !== item.systemStock
    ).length;
    const [auditResult] = await connection.query(
      `INSERT INTO auditoria_inventario (
         codigo,
         usuario_id,
         fecha_auditoria,
         iniciado_en,
         finalizado_en,
         total_productos,
         productos_con_diferencia
       )
       VALUES (NULL, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)`,
      [req.user?.id || null, auditDate, startedAt, items.length, differences]
    );

    const auditId = Number(auditResult.insertId);
    const auditCode = `AUD-${auditDate.slice(0, 4)}-${String(auditId).padStart(6, '0')}`;
    await connection.query(
      `UPDATE auditoria_inventario
       SET codigo = ?
       WHERE auditoria_inventario_id = ?`,
      [auditCode, auditId]
    );

    const productsById = new Map(
      products.map((product) => [Number(product.producto_id), product])
    );
    const reportItems = [];

    for (const item of items) {
      const product = productsById.get(item.productId);
      const difference = item.physicalStock - item.systemStock;

      await connection.query(
        `INSERT INTO auditoria_inventario_detalle (
           auditoria_inventario_id,
           producto_id,
           producto_nombre,
           categoria_nombre,
           unidad_medida,
           stock_sistema,
           conteo_fisico,
           diferencia,
           notas
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditId,
          item.productId,
          product.nombre,
          product.categoria,
          product.unidad_medida,
          item.systemStock,
          item.physicalStock,
          difference,
          item.notes || null,
        ]
      );

      if (difference !== 0) {
        await setTotalStock({
          connection,
          productId: item.productId,
          targetStock: item.physicalStock,
          userId: req.user?.id,
          reason: `Ajuste por auditoría de inventario ${auditCode}`,
          referenceType: 'Corrección',
          referenceId: auditId,
        });
      }

      reportItems.push({
        productId: String(item.productId),
        name: product.nombre,
        category: product.categoria,
        unit: product.unidad_medida,
        systemStock: item.systemStock,
        physicalStock: item.physicalStock,
        difference,
        notes: item.notes,
      });
    }

    const [users] = await connection.query(
      `SELECT
         TRIM(CONCAT_WS(' ', primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)) AS nombre,
         correo
       FROM usuario
       WHERE usuario_id = ?
       LIMIT 1`,
      [req.user?.id || null]
    );

    await connection.query(
      `INSERT INTO auditoria (
         usuario_id,
         accion,
         entidad,
         entidad_id,
         descripcion,
         ip
       )
       VALUES (?, 'FINALIZAR_AUDITORIA', 'auditoria_inventario', ?, ?, ?)`,
      [
        req.user?.id || null,
        auditId,
        `Auditoría ${auditCode} del ${auditDate} finalizada con ${differences} producto(s) con diferencia`,
        req.ip || null,
      ]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Auditoría finalizada y existencias conciliadas correctamente',
      audit: {
        id: String(auditId),
        code: auditCode,
        auditDate,
        startedAt: new Date(`${startedAt.replace(' ', 'T')}Z`).toISOString(),
        completedAt: new Date().toISOString(),
        auditor: users[0]?.nombre || users[0]?.correo || 'Usuario del sistema',
        totalProducts: items.length,
        discrepancies: differences,
        items: reportItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.message || 'Error al finalizar la auditoría de inventario',
    });
  } finally {
    connection.release();
  }
};

const eliminarProducto = async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE producto_inventario
       SET activo = 0
       WHERE producto_id = ? AND activo = 1`,
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Producto no encontrado o ya estaba inactivo',
      });
    }
    res.json({
      message:
        'Producto inactivado; se conservaron sus lotes y movimientos históricos',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al inactivar producto',
      error: error.message,
    });
  }
};

module.exports = {
  listarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  ajustarStock,
  finalizarAuditoria,
  eliminarProducto,
};
