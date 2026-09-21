const express = require('express');
const {
  listarCitas,
  obtenerCitaPorId,
  crearCita,
  actualizarCita,
  cambiarEstadoCita,
  eliminarCita,
} = require('../controllers/citasController');

const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('appointments', 'ver'), listarCitas);
router.get('/:id', verificarToken, verificarPermiso('appointments', 'ver'), obtenerCitaPorId);
router.post('/', verificarToken, verificarPermiso('appointments', 'crear'), crearCita);
router.put('/:id', verificarToken, verificarPermiso('appointments', 'editar'), actualizarCita);
router.patch('/:id/estado', verificarToken, verificarPermiso('appointments', 'editar'), cambiarEstadoCita);
router.delete('/:id', verificarToken, verificarPermiso('appointments', 'eliminar'), eliminarCita);

module.exports = router;
