const express = require('express');
const {
  listarVentas,
  crearVenta,
  eliminarVenta,
} = require('../controllers/cierreVentasController');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', verificarToken, listarVentas);
router.post('/', verificarToken, crearVenta);
router.delete('/:id', verificarToken, eliminarVenta);

module.exports = router;
