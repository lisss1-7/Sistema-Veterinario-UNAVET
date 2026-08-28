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
      FROM lotes_producto lote_proveedor
      LEFT JOIN proveedores proveedor
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
  FROM productos_inventario producto
  INNER JOIN categorias_inventario categoria
    ON categoria.categoria_id = producto.categoria_id
  INNER JOIN unidades_medida unidad
    ON unidad.unidad_medida_id = producto.unidad_medida_id
  INNER JOIN estados_producto estado_activo
    ON estado_activo.es_inicial = 1
   AND estado_activo.activo = 1
  INNER JOIN estados_producto estado_agotado
    ON estado_agotado.sin_existencias = 1
   AND estado_agotado.activo = 1
  INNER JOIN estados_producto estado_inactivo
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
    FROM lotes_producto
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
    `INSERT INTO categorias_inventario (
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
     FROM categorias_inventario
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
    `INSERT INTO proveedores (nombre, activo)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE activo = 1`,
    [normalizedName]
  );
  const [rows] = await connection.query(
    `SELECT proveedor_id
     FROM proveedores
     WHERE nombre = ?
     LIMIT 1`,
    [normalizedName]
  );
  return rows[0].proveedor_id;
};

const getOrCreateUnit = async (connection, name) => {
  const normalizedName = String(name || '').trim();
  await connection.query(
    `INSERT INTO unidades_medida (nombre, activo)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE activo = 1`,
    [normalizedName]
  );
  const [rows] = await connection.query(
    `SELECT unidad_medida_id
     FROM unidades_medida
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
      `INSERT INTO productos_inventario (
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
      `INSERT INTO lotes_producto (
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
       FROM productos_inventario
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
      `UPDATE productos_inventario
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

const eliminarProducto = async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE productos_inventario
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
  eliminarProducto,
};
