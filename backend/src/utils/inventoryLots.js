const getProductAndLots = async (connection, productId) => {
  const [products] = await connection.query(
    `SELECT producto_id, nombre, precio_venta, activo
     FROM productos_inventario
     WHERE producto_id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId]
  );
  if (products.length === 0) {
    const error = new Error('Producto de inventario no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const [lots] = await connection.query(
    `SELECT
       producto_lote_id,
       producto_id,
       proveedor_id,
       codigo_lote,
       fecha_vencimiento,
       precio_compra,
       stock
     FROM lotes_producto
     WHERE producto_id = ?
     ORDER BY
       CASE WHEN stock > 0 THEN 0 ELSE 1 END,
       CASE WHEN fecha_vencimiento IS NULL THEN 1 ELSE 0 END,
       fecha_vencimiento,
       producto_lote_id
     FOR UPDATE`,
    [productId]
  );

  return {
    product: products[0],
    lots,
    stock: lots.reduce(
      (sum, lot) => sum + Number(lot.stock || 0),
      0
    ),
  };
};

const recordMovement = async ({
  connection,
  productId,
  lotId,
  userId,
  movementType,
  quantity,
  previousStock,
  newStock,
  reason,
  referenceType = 'Manual',
  referenceId = null,
}) => {
  await connection.query(
    `INSERT INTO movimientos_inventario (
       producto_id,
       producto_lote_id,
       usuario_id,
       tipo_movimiento,
       cantidad,
       stock_anterior,
       stock_nuevo,
       motivo,
       referencia_tipo,
       referencia_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      lotId || null,
      userId || null,
      movementType,
      quantity,
      previousStock,
      newStock,
      reason,
      referenceType,
      referenceId,
    ]
  );
};

const consumeLots = async ({
  connection,
  productId,
  quantity,
  userId,
  reason,
  referenceType,
  referenceId,
}) => {
  const normalizedQuantity = Number(quantity);
  if (
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity <= 0
  ) {
    const error = new Error(
      'La cantidad de inventario debe ser un entero mayor que cero'
    );
    error.statusCode = 400;
    throw error;
  }

  const inventory = await getProductAndLots(connection, productId);
  if (!inventory.product.activo) {
    const error = new Error(
      `El producto ${inventory.product.nombre} está inactivo`
    );
    error.statusCode = 400;
    throw error;
  }
  if (inventory.stock < normalizedQuantity) {
    const error = new Error(
      `Stock insuficiente para ${inventory.product.nombre}. Disponible: ${inventory.stock}`
    );
    error.statusCode = 400;
    throw error;
  }

  let remaining = normalizedQuantity;
  let runningStock = inventory.stock;
  const allocations = [];

  for (const lot of inventory.lots) {
    if (remaining <= 0) break;
    const available = Number(lot.stock || 0);
    if (available <= 0) continue;

    const consumed = Math.min(available, remaining);
    await connection.query(
      `UPDATE lotes_producto
       SET stock = stock - ?
       WHERE producto_lote_id = ?`,
      [consumed, lot.producto_lote_id]
    );

    const previousStock = runningStock;
    runningStock -= consumed;
    await recordMovement({
      connection,
      productId,
      lotId: lot.producto_lote_id,
      userId,
      movementType: 'Salida',
      quantity: consumed,
      previousStock,
      newStock: runningStock,
      reason,
      referenceType,
      referenceId,
    });
    allocations.push({
      productId: Number(productId),
      lotId: lot.producto_lote_id,
      quantity: consumed,
    });
    remaining -= consumed;
  }

  return {
    product: inventory.product,
    previousStock: inventory.stock,
    newStock: runningStock,
    allocations,
  };
};

const restoreLots = async ({
  connection,
  allocations,
  userId,
  reason,
  referenceType,
  referenceId,
}) => {
  const byProduct = new Map();
  for (const allocation of allocations) {
    const productId = Number(
      allocation.productId || allocation.producto_id
    );
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push({
      lotId: Number(
        allocation.lotId || allocation.producto_lote_id
      ),
      quantity: Number(allocation.quantity || allocation.cantidad),
    });
  }

  for (const [productId, productAllocations] of byProduct) {
    const inventory = await getProductAndLots(connection, productId);
    const lotsById = new Map(
      inventory.lots.map((lot) => [
        Number(lot.producto_lote_id),
        lot,
      ])
    );
    let runningStock = inventory.stock;

    for (const allocation of productAllocations) {
      const lot = lotsById.get(allocation.lotId);
      if (!lot || allocation.quantity <= 0) {
        const error = new Error(
          'No se pudo identificar el lote que debe reintegrarse'
        );
        error.statusCode = 409;
        throw error;
      }
      const previousStock = runningStock;
      runningStock += allocation.quantity;
      await connection.query(
        `UPDATE lotes_producto
         SET stock = stock + ?
         WHERE producto_lote_id = ?`,
        [allocation.quantity, allocation.lotId]
      );
      await recordMovement({
        connection,
        productId,
        lotId: allocation.lotId,
        userId,
        movementType: 'Entrada',
        quantity: allocation.quantity,
        previousStock,
        newStock: runningStock,
        reason,
        referenceType,
        referenceId,
      });
    }
  }
};

const addToPrimaryLot = async ({
  connection,
  productId,
  quantity,
  supplierId = null,
  expirationDate = null,
  purchasePrice = null,
  userId,
  reason,
  referenceType = 'Manual',
  referenceId = null,
}) => {
  const normalizedQuantity = Number(quantity);
  if (
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity <= 0
  ) {
    const error = new Error(
      'La entrada de inventario debe ser un entero mayor que cero'
    );
    error.statusCode = 400;
    throw error;
  }

  const inventory = await getProductAndLots(connection, productId);
  let lot = inventory.lots[0];
  if (!lot) {
    const [result] = await connection.query(
      `INSERT INTO lotes_producto (
         producto_id,
         proveedor_id,
         codigo_lote,
         fecha_vencimiento,
         precio_compra,
         stock
       )
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        productId,
        supplierId,
        `INICIAL-${productId}`,
        expirationDate || null,
        purchasePrice,
      ]
    );
    lot = { producto_lote_id: result.insertId };
  }

  await connection.query(
    `UPDATE lotes_producto
     SET
       stock = stock + ?,
       proveedor_id = COALESCE(?, proveedor_id),
       fecha_vencimiento = COALESCE(?, fecha_vencimiento),
       precio_compra = COALESCE(?, precio_compra)
     WHERE producto_lote_id = ?`,
    [
      normalizedQuantity,
      supplierId,
      expirationDate,
      purchasePrice,
      lot.producto_lote_id,
    ]
  );
  await recordMovement({
    connection,
    productId,
    lotId: lot.producto_lote_id,
    userId,
    movementType: 'Entrada',
    quantity: normalizedQuantity,
    previousStock: inventory.stock,
    newStock: inventory.stock + normalizedQuantity,
    reason,
    referenceType,
    referenceId,
  });
  return inventory.stock + normalizedQuantity;
};

const setTotalStock = async ({
  connection,
  productId,
  targetStock,
  supplierId,
  expirationDate,
  purchasePrice,
  userId,
  reason,
}) => {
  const normalizedTarget = Number(targetStock);
  if (!Number.isInteger(normalizedTarget) || normalizedTarget < 0) {
    const error = new Error(
      'El stock debe ser un entero mayor o igual que cero'
    );
    error.statusCode = 400;
    throw error;
  }
  const inventory = await getProductAndLots(connection, productId);
  const difference = normalizedTarget - inventory.stock;
  if (difference > 0) {
    return addToPrimaryLot({
      connection,
      productId,
      quantity: difference,
      supplierId,
      expirationDate,
      purchasePrice,
      userId,
      reason,
    });
  }
  if (difference < 0) {
    const result = await consumeLots({
      connection,
      productId,
      quantity: Math.abs(difference),
      userId,
      reason,
      referenceType: 'Manual',
      referenceId: null,
    });
    return result.newStock;
  }

  if (inventory.lots[0]) {
    await connection.query(
      `UPDATE lotes_producto
       SET
         proveedor_id = ?,
         fecha_vencimiento = ?,
         precio_compra = COALESCE(?, precio_compra)
       WHERE producto_lote_id = ?`,
      [
        supplierId || null,
        expirationDate || null,
        purchasePrice,
        inventory.lots[0].producto_lote_id,
      ]
    );
  }
  return inventory.stock;
};

module.exports = {
  getProductAndLots,
  recordMovement,
  consumeLots,
  restoreLots,
  addToPrimaryLot,
  setTotalStock,
};
