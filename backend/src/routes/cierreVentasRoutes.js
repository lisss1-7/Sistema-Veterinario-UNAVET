const express = require('express');
const {
  listarVentas,
  listarTurnos,
  finalizarTurno,
  obtenerEstadoDia,
  finalizarDia,
  crearVenta,
  eliminarVenta,
} = require('../controllers/cierreVentasController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('inventory', 'ver'), listarVentas);
router.get('/estado', verificarToken, verificarPermiso('inventory', 'ver'), obtenerEstadoDia);
router.get('/turnos', verificarToken, verificarPermiso('inventory', 'ver'), listarTurnos);
router.post('/turnos/finalizar', verificarToken, verificarPermiso('inventory', 'editar'), finalizarTurno);
router.post('/finalizar', verificarToken, verificarPermiso('inventory', 'editar'), finalizarDia);
router.post('/', verificarToken, verificarPermiso('inventory', 'crear'), crearVenta);
router.post('/:id/anular', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarVenta);
router.delete('/:id', verificarToken, verificarPermiso('inventory', 'eliminar'), eliminarVenta);

module.exports = router;
