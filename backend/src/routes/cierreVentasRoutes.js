const express = require('express');
const {
  listarVentas,
  crearVenta,
  eliminarVenta,
} = require('../controllers/cierreVentasController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('inventory', 'ver'), listarVentas);
router.post('/', verificarToken, verificarPermiso('inventory', 'crear'), crearVenta);
router.delete('/:id', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarVenta);

module.exports = router;
