const express = require('express');
const {
  listarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  ajustarStock,
  finalizarAuditoria,
  eliminarProducto,
} = require('../controllers/inventarioController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');
const { listarHistorial } = require('../controllers/inventarioHistorialController');
const { verificarAdminInventario, consultarAccesoOperaciones } = require('../middleware/inventoryOperationsAccess');
const operaciones = require('../controllers/inventarioOperacionesController');

const router = express.Router();

router.get('/operaciones-acceso', verificarToken, verificarPermiso('inventory', 'ver'), consultarAccesoOperaciones);

router.get('/proveedores', verificarToken, verificarPermiso('inventory', 'ver'), verificarAdminInventario, operaciones.listarProveedores);
router.post('/proveedores', verificarToken, verificarPermiso('inventory', 'crear'), verificarAdminInventario, operaciones.guardarProveedor);
router.put('/proveedores/:id', verificarToken, verificarPermiso('inventory', 'editar'), verificarAdminInventario, operaciones.guardarProveedor);
router.get('/compras', verificarToken, verificarPermiso('inventory', 'ver'), verificarAdminInventario, operaciones.listarCompras);
router.post('/compras', verificarToken, verificarPermiso('inventory', 'crear'), verificarAdminInventario, operaciones.crearCompra);
router.post('/compras/:id/anular', verificarToken, verificarPermiso('inventory', 'eliminar'), verificarAdminInventario, operaciones.anularCompra);
router.get('/movimientos', verificarToken, verificarPermiso('inventory', 'ver'), verificarAdminInventario, operaciones.listarMovimientos);

router.get('/historial', verificarToken, verificarPermiso('inventory', 'ver'), verificarAdminInventario, listarHistorial);
router.get('/', verificarToken, verificarPermiso('inventory', 'ver'), listarProductos);
router.post('/auditorias/finalizar', verificarToken, verificarPermiso('inventory', 'editar'), finalizarAuditoria);
router.get('/:id', verificarToken, verificarPermiso('inventory', 'ver'), obtenerProductoPorId);
router.post('/', verificarToken, verificarPermiso('inventory', 'crear'), crearProducto);
router.put('/:id', verificarToken, verificarPermiso('inventory', 'editar'), actualizarProducto);
router.patch('/:id/stock', verificarToken, verificarPermiso('inventory', 'editar'), ajustarStock);
router.delete('/:id', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarProducto);

module.exports = router;
