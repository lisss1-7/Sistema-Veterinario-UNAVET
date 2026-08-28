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

const router = express.Router();

router.get('/', verificarToken, listarProductos);
router.get('/:id', verificarToken, obtenerProductoPorId);
router.post('/', verificarToken, crearProducto);
router.put('/:id', verificarToken, actualizarProducto);
router.patch('/:id/stock', verificarToken, ajustarStock);
router.delete('/:id', verificarToken, eliminarProducto);

module.exports = router;
