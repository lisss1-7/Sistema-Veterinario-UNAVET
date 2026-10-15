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
const operaciones = require('../controllers/inventarioOperacionesController');

const router = express.Router();

router.get('/proveedores', verificarToken, verificarPermiso('inventory', 'ver'), operaciones.listarProveedores);
router.post('/proveedores', verificarToken, verificarPermiso('inventory', 'crear'), operaciones.guardarProveedor);
router.put('/proveedores/:id', verificarToken, verificarPermiso('inventory', 'editar'), operaciones.guardarProveedor);
router.get('/compras', verificarToken, verificarPermiso('inventory', 'ver'), operaciones.listarCompras);
router.post('/compras', verificarToken, verificarPermiso('inventory', 'crear'), operaciones.crearCompra);
router.post('/compras/:id/anular', verificarToken, verificarPermiso('inventory', 'eliminar'), operaciones.anularCompra);
router.get('/movimientos', verificarToken, verificarPermiso('inventory', 'ver'), operaciones.listarMovimientos);

router.get('/', verificarToken, verificarPermiso('inventory', 'ver'), listarProductos);
router.post('/auditorias/finalizar', verificarToken, verificarPermiso('inventory', 'editar'), finalizarAuditoria);
router.get('/:id', verificarToken, verificarPermiso('inventory', 'ver'), obtenerProductoPorId);
router.post('/', verificarToken, verificarPermiso('inventory', 'crear'), crearProducto);
router.put('/:id', verificarToken, verificarPermiso('inventory', 'editar'), actualizarProducto);
router.patch('/:id/stock', verificarToken, verificarPermiso('inventory', 'editar'), ajustarStock);
router.delete('/:id', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarProducto);

module.exports = router;
