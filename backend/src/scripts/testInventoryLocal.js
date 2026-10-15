// Local integration checks run inside one transaction, always rolled back.
// No test products, providers, purchases or sales are kept in the user's data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('../config/db');

const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const run = async () => {
  if (!['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST).toLowerCase())) {
    throw new Error('Las pruebas requieren MySQL local');
  }
  const connection = await pool.getConnection();
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  let began = false;
  try {
    await connection.beginTransaction(); began = true;
    const adapter = {
      query: (...args) => connection.query(...args),
      beginTransaction: () => connection.query('SAVEPOINT inventory_test_request'),
      commit: () => connection.query('RELEASE SAVEPOINT inventory_test_request'),
      rollback: () => connection.query('ROLLBACK TO SAVEPOINT inventory_test_request'),
      release: () => {},
    };
    pool.query = adapter.query;
    pool.getConnection = async () => adapter;
    const inventory = require('../controllers/inventarioController');
    const operations = require('../controllers/inventarioOperacionesController');
    const sales = require('../controllers/cierreVentasController');
    const [[user]] = await connection.query('SELECT usuario_id FROM usuario LIMIT 1');
    assert.ok(user, 'Debe existir un usuario local para comprobar la atribución');
    const context = { user: { id: user.usuario_id }, params: {}, query: {} };
    const call = async (controller, request = {}, expected = 200) => {
      const res = response();
      await controller({ ...context, ...request }, res);
      assert.equal(res.statusCode, expected, res.body?.message);
      return res.body;
    };
    const suffix = randomUUID();
    const supplier = await call(operations.guardarProveedor, { body: { name: `Proveedor prueba ${suffix}`, active: true } }, 201);
    const product = await call(inventory.crearProducto, { body: {
      name: `Producto prueba ${suffix}`, category: 'Prueba inventario', presentation: 'Unidad prueba',
      description: 'Prueba local con rollback', status: 'Activo', minStock: 1, price: 15,
      currentStock: 999, supplier: 'No debe crearse', expirationDate: '2099-01-01',
    } }, 201);
    const second = await call(inventory.crearProducto, { body: {
      name: `Segundo producto ${suffix}`, category: 'Prueba inventario', presentation: 'Unidad prueba',
      status: 'Activo', minStock: 1, price: 2,
    } }, 201);
    const getStock = async (productId) => {
      const [[row]] = await connection.query('SELECT COALESCE(SUM(stock), 0) AS stock FROM lote_producto WHERE producto_id = ?', [productId]);
      return Number(row.stock);
    };
    assert.equal(await getStock(product.id), 0, 'Un producto nuevo debe iniciar sin stock');
    let date = '2000-01-01';
    for (let day = 1; day <= 28; day++) {
      date = `2000-01-${String(day).padStart(2, '0')}`;
      const [days] = await connection.query('SELECT 1 FROM cierre_venta_dia WHERE fecha = ?', [date]);
      if (!days.length) break;
      assert.ok(day < 28, 'Se requiere una fecha de prueba sin cierre');
    }
    const body = {
      supplierId: supplier.id, date, receipt: 'COMPROBANTE-PRUEBA', requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: 20, unitCost: 5.25, lotCode: 'LOTE-PRUEBA', expirationDate: '2099-01-01' }],
    };
    const purchase = await call(operations.crearCompra, { body }, 201);
    assert.equal(await getStock(product.id), 20);
    const repeated = await call(operations.crearCompra, { body });
    assert.equal(repeated.id, purchase.id);
    assert.equal(await getStock(product.id), 20, 'Un reintento no duplica el stock');
    await call(operations.crearCompra, { body: { ...body, items: [{ ...body.items[0], quantity: 21 }] } }, 409);
    const [[payment]] = await connection.query('SELECT codigo FROM forma_pago WHERE activo = 1 LIMIT 1');
    assert.ok(payment, 'Debe existir una forma de pago activa');
    const sale = await call(sales.crearVenta, { body: {
      date, client: 'Prueba local', paymentMethod: payment.codigo,
      items: [{ type: 'Producto', productId: product.id, quantity: 3, unitPrice: 15 }],
    } }, 201);
    await call(inventory.ajustarStock, { params: { id: product.id }, body: { adjustment: -2, operation: 'consumption', reason: 'Uso clínico de prueba' } });
    assert.equal(await getStock(product.id), 15, 'Compra 20 - venta 3 - consumo 2 = 15');
    await call(inventory.ajustarStock, { params: { id: product.id }, body: { adjustment: -100, reason: 'Prueba de insuficiencia' } }, 400);
    await call(inventory.ajustarStock, { params: { id: product.id }, body: { adjustment: 1 } }, 400);
    assert.equal(await getStock(product.id), 15);
    await call(inventory.actualizarProducto, { params: { id: product.id }, body: {
      name: `Producto editado ${suffix}`, category: 'Prueba inventario', presentation: 'Unidad prueba',
      status: 'Activo', minStock: 2, price: 16, currentStock: 1000, supplier: 'No debe cambiar', expirationDate: '2040-01-01',
    } });
    assert.equal(await getStock(product.id), 15, 'Editar la ficha no cambia el saldo');
    const [[lot]] = await connection.query('SELECT proveedor_id, DATE_FORMAT(fecha_vencimiento, "%Y-%m-%d") AS fecha FROM lote_producto WHERE producto_id = ?', [product.id]);
    assert.equal(String(lot.proveedor_id), supplier.id);
    assert.equal(lot.fecha, '2099-01-01');
    await call(operations.anularCompra, { params: { id: purchase.id }, body: { reason: 'Ya consumida' } }, 409);
    await call(sales.eliminarVenta, { params: { id: sale.id }, body: { reason: 'Corrección de venta' } });
    assert.equal(await getStock(product.id), 18);
    await call(sales.eliminarVenta, { params: { id: sale.id }, body: { reason: 'Repetición' } }, 409);
    assert.equal(await getStock(product.id), 18);
    const listedSales = await call(sales.listarVentas, { query: { fecha: date } });
    const canceledSale = listedSales.find((row) => row.id === sale.id);
    assert.ok(canceledSale?.canceled && canceledSale.items.length && canceledSale.payments.length, 'Se conserva la venta anulada con detalle y pagos');
    const multiBody = { supplierId: supplier.id, date, requestKey: randomUUID(), items: [
      { productId: product.id, quantity: 2, unitCost: 1 },
      { productId: second.id, quantity: 4, unitCost: 2 },
    ] };
    const multi = await call(operations.crearCompra, { body: multiBody }, 201);
    assert.equal(await getStock(second.id), 4);
    await connection.query('SAVEPOINT inventory_test_partial_cancellation');
    await call(inventory.ajustarStock, { params: { id: second.id }, body: { adjustment: -1, operation: 'consumption', reason: 'Prueba de anulación parcial' } });
    await call(operations.anularCompra, { params: { id: multi.id }, body: { reason: 'No debe anularse parcialmente' } }, 409);
    assert.equal(await getStock(product.id), 20, 'El rechazo en la segunda fila revierte la salida de la primera');
    assert.equal(await getStock(second.id), 3);
    await connection.query('ROLLBACK TO SAVEPOINT inventory_test_partial_cancellation');
    await connection.query('RELEASE SAVEPOINT inventory_test_partial_cancellation');
    await call(operations.anularCompra, { params: { id: multi.id }, body: { reason: 'Recepción incorrecta' } });
    assert.equal(await getStock(second.id), 0);
    assert.equal(await getStock(product.id), 18);
    await call(operations.anularCompra, { params: { id: multi.id }, body: { reason: 'Repetición' } }, 409);
    const invalidBody = { ...multiBody, requestKey: randomUUID(), items: [multiBody.items[0], { productId: 999999999, quantity: 1, unitCost: 1 }] };
    await call(operations.crearCompra, { body: invalidBody }, 404);
    assert.equal(await getStock(product.id), 18, 'El error de la segunda fila revierte la primera');
    const [[invalidCount]] = await connection.query('SELECT COUNT(*) AS count FROM compra_inventario WHERE clave_envio = ?', [invalidBody.requestKey]);
    assert.equal(Number(invalidCount.count), 0, 'El error no conserva un encabezado parcial');
    const movements = await call(operations.listarMovimientos, { query: { productId: product.id } });
    assert.ok(movements.items.some((item) => item.document.includes(`Compra #${purchase.id}`)));
    assert.ok(movements.items.some((item) => item.reason.includes('Consumo interno')));
    assert.ok(movements.items.every((item) => item.responsible !== 'Sin responsable registrado'));
    const purchases = await call(operations.listarCompras, { query: { supplierId: supplier.id } });
    assert.equal(purchases.find((item) => item.id === purchase.id).total, 105);
    assert.ok(purchases.find((item) => item.id === multi.id).canceled);
    await call(operations.guardarProveedor, { params: { id: supplier.id }, body: { name: `Proveedor prueba ${suffix}`, active: false } });
    await call(operations.crearCompra, { body }); // Replay remains valid for inactive suppliers.
    await call(operations.crearCompra, { body: { ...body, requestKey: randomUUID() } }, 400);
    const suppliers = await call(operations.listarProveedores);
    assert.equal(suppliers.find((item) => item.id === supplier.id).active, false);
    console.log('OK: 20 - 3 - 2 = 15; lotes, reintentos, anulaciones, errores parciales, proveedores e historial verificados.');
  } finally {
    pool.query = originalQuery; pool.getConnection = originalGetConnection;
    if (began) await connection.rollback();
    connection.release();
    console.log('Transacción de prueba revertida; no se conservaron datos de prueba.');
  }
};

run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
