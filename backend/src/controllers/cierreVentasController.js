const pool = require('../config/db');
const {
  getProductAndLots,
  consumeLots,
  restoreLots,
} = require('../utils/inventoryLots');

const mapVenta = (row) => ({
  id: String(row.venta_id),
  date: row.fecha,
  client: row.cliente || '',
  payments: row.payments || [],
  invoiceNit: row.factura_nit || '',
  invoiceName: row.factura_nombre || '',
  total: Number(row.total || 0),
  items: row.items || [],
});

const listarVentas = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const fecha =
      req.query.fecha || new Date().toISOString().slice(0, 10);
    const [ventas] = await connection.query(
      `SELECT
         venta.*,
         DATE_FORMAT(venta.fecha, '%Y-%m-%d') AS fecha,
         COALESCE(SUM(detalle.subtotal), 0) AS total
       FROM cierres_ventas venta
       LEFT JOIN cierre_ventas_detalle detalle
         ON detalle.venta_id = venta.venta_id
       WHERE venta.fecha = ?
       GROUP BY venta.venta_id
       ORDER BY venta.venta_id`,
      [fecha]
    );
    if (ventas.length === 0) return res.json([]);

    const ids = ventas.map((venta) => venta.venta_id);
    const [detalles] = await connection.query(
      `SELECT
         detalle_id,
         venta_id,
         tipo,
         producto_id,
         servicio_id,
         descripcion,
         cantidad,
         precio_unitario,
         subtotal
       FROM cierre_ventas_detalle
       WHERE venta_id IN (?)
       ORDER BY detalle_id`,
      [ids]
    );
    const [pagos] = await connection.query(
      `SELECT
         pago.venta_id,
         forma.forma_pago_id,
         forma.codigo,
         forma.nombre,
         pago.monto
       FROM venta_pagos pago
       INNER JOIN formas_pago forma
         ON forma.forma_pago_id = pago.forma_pago_id
       WHERE pago.venta_id IN (?)
       ORDER BY forma.orden, forma.nombre`,
      [ids]
    );

    const itemsBySale = detalles.reduce((result, item) => {
      const key = String(item.venta_id);
      if (!result[key]) result[key] = [];
      result[key].push({
        id: String(item.detalle_id),
        type: item.tipo,
        productId: item.producto_id
          ? String(item.producto_id)
          : '',
        serviceId: item.servicio_id
          ? String(item.servicio_id)
          : '',
        description: item.descripcion,
        quantity: Number(item.cantidad),
        unitPrice: Number(item.precio_unitario),
        subtotal: Number(item.subtotal),
      });
      return result;
    }, {});
    const paymentsBySale = pagos.reduce((result, payment) => {
      const key = String(payment.venta_id);
      if (!result[key]) result[key] = [];
      result[key].push({
        id: String(payment.forma_pago_id),
        code: payment.codigo,
        name: payment.nombre,
        amount: Number(payment.monto),
      });
      return result;
    }, {});

    res.json(
      ventas.map((venta) =>
        mapVenta({
          ...venta,
          items: itemsBySale[String(venta.venta_id)] || [],
          payments: paymentsBySale[String(venta.venta_id)] || [],
        })
      )
    );
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar el cierre de ventas',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const crearVenta = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      date,
      client,
      paymentMethod,
      invoiceNit,
      invoiceName,
      items,
    } = req.body;
    if (
      !date ||
      !paymentMethod ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        message:
          'Fecha, forma de pago y al menos un producto o servicio son obligatorios',
      });
    }

    await connection.beginTransaction();
    const [paymentRows] = await connection.query(
      `SELECT forma_pago_id
       FROM formas_pago
       WHERE codigo = ? AND activo = 1
       LIMIT 1`,
      [paymentMethod]
    );
    if (paymentRows.length === 0) {
      const error = new Error(
        'La forma de pago seleccionada no está disponible'
      );
      error.statusCode = 400;
      throw error;
    }

    const normalizedItems = [];
    let total = 0;
    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        const error = new Error(
          'Cada detalle debe tener cantidad y precio válidos'
        );
        error.statusCode = 400;
        throw error;
      }

      if (item.type === 'Producto') {
        if (!Number.isInteger(quantity) || !item.productId) {
          const error = new Error(
            'La cantidad de producto debe ser un entero y tener producto'
          );
          error.statusCode = 400;
          throw error;
        }
        const inventory = await getProductAndLots(
          connection,
          item.productId
        );
        if (!inventory.product.activo) {
          const error = new Error(
            `El producto ${inventory.product.nombre} está inactivo`
          );
          error.statusCode = 400;
          throw error;
        }
        if (inventory.stock < quantity) {
          const error = new Error(
            `Stock insuficiente para ${inventory.product.nombre}. Disponible: ${inventory.stock}`
          );
          error.statusCode = 400;
          throw error;
        }
        normalizedItems.push({
          type: 'Producto',
          productId: item.productId,
          serviceId: null,
          description: inventory.product.nombre,
          quantity,
          unitPrice,
        });
      } else if (item.type === 'Servicio') {
        if (!item.serviceId) {
          const error = new Error(
            'El servicio no contiene un identificador válido'
          );
          error.statusCode = 400;
          throw error;
        }
        const [services] = await connection.query(
          `SELECT servicio_id, nombre
           FROM servicios
           WHERE servicio_id = ? AND activo = 1
           LIMIT 1`,
          [item.serviceId]
        );
        if (services.length === 0) {
          const error = new Error(
            'Uno de los servicios ya no está disponible'
          );
          error.statusCode = 400;
          throw error;
        }
        normalizedItems.push({
          type: 'Servicio',
          productId: null,
          serviceId: item.serviceId,
          description: services[0].nombre,
          quantity,
          unitPrice,
        });
      } else {
        const error = new Error(
          'El tipo de detalle debe ser Producto o Servicio'
        );
        error.statusCode = 400;
        throw error;
      }
      total += quantity * unitPrice;
    }

    const [saleResult] = await connection.query(
      `INSERT INTO cierres_ventas (
         fecha,
         cliente,
         factura_nit,
         factura_nombre,
         usuario_id
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        date,
        client || null,
        invoiceNit || null,
        invoiceName || null,
        req.user?.id || null,
      ]
    );
    await connection.query(
      `INSERT INTO venta_pagos (
         venta_id,
         forma_pago_id,
         monto
       )
       VALUES (?, ?, ?)`,
      [
        saleResult.insertId,
        paymentRows[0].forma_pago_id,
        total,
      ]
    );

    for (const item of normalizedItems) {
      const [detailResult] = await connection.query(
        `INSERT INTO cierre_ventas_detalle (
           venta_id,
           tipo,
           producto_id,
           servicio_id,
           descripcion,
           cantidad,
           precio_unitario
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          saleResult.insertId,
          item.type,
          item.productId,
          item.serviceId,
          item.description,
          item.quantity,
          item.unitPrice,
        ]
      );

      if (item.type === 'Producto') {
        const consumption = await consumeLots({
          connection,
          productId: item.productId,
          quantity: item.quantity,
          userId: req.user?.id,
          reason: 'Venta registrada en cierre diario',
          referenceType: 'Venta',
          referenceId: saleResult.insertId,
        });
        for (const allocation of consumption.allocations) {
          await connection.query(
            `INSERT INTO venta_detalle_lotes (
               detalle_id,
               producto_lote_id,
               cantidad
             )
             VALUES (?, ?, ?)`,
            [
              detailResult.insertId,
              allocation.lotId,
              allocation.quantity,
            ]
          );
        }
      }
    }

    await connection.commit();
    res.status(201).json({
      message:
        'Venta registrada y lotes descontados correctamente',
      id: String(saleResult.insertId),
      total,
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 400).json({
      message: error.message || 'Error al registrar la venta',
    });
  } finally {
    connection.release();
  }
};

const eliminarVenta = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sales] = await connection.query(
      `SELECT venta_id
       FROM cierres_ventas
       WHERE venta_id = ?
       LIMIT 1
       FOR UPDATE`,
      [req.params.id]
    );
    if (sales.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Venta no encontrada',
      });
    }

    const [allocations] = await connection.query(
      `SELECT
         detalle.producto_id,
         asignacion.producto_lote_id,
         asignacion.cantidad
       FROM cierre_ventas_detalle detalle
       INNER JOIN venta_detalle_lotes asignacion
         ON asignacion.detalle_id = detalle.detalle_id
       WHERE detalle.venta_id = ?
       ORDER BY detalle.producto_id, asignacion.producto_lote_id`,
      [req.params.id]
    );
    await restoreLots({
      connection,
      allocations,
      userId: req.user?.id,
      reason: 'Anulación de venta del cierre diario',
      referenceType: 'Venta',
      referenceId: req.params.id,
    });

    await connection.query(
      `DELETE FROM cierres_ventas
       WHERE venta_id = ?`,
      [req.params.id]
    );
    await connection.commit();
    res.json({
      message:
        'Venta eliminada y lotes reintegrados correctamente',
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.message || 'Error al eliminar la venta',
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  listarVentas,
  crearVenta,
  eliminarVenta,
};
