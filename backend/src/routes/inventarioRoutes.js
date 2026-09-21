const express = require('express');
const {
  listarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  ajustarStock,
  eliminarProducto,
} = require('../controllers/inventarioController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('inventory', 'ver'), listarProductos);
router.get('/:id', verificarToken, verificarPermiso('inventory', 'ver'), obtenerProductoPorId);
router.post('/', verificarToken, verificarPermiso('inventory', 'crear'), crearProducto);
router.put('/:id', verificarToken, verificarPermiso('inventory', 'editar'), actualizarProducto);
router.patch('/:id/stock', verificarToken, verificarPermiso('inventory', 'editar'), ajustarStock);
router.delete('/:id', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarProducto);

module.exports = router;
