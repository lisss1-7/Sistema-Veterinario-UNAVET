const express = require('express');
const {
  listarVacunaciones,
  listarVacunacionesPorPaciente,
  obtenerVacunacionPorId,
  crearVacunacion,
  eliminarVacunacion,
} = require('../controllers/vacunacionesController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('patients', 'ver'), listarVacunaciones);
router.get('/paciente/:pacienteId', verificarToken, verificarPermiso('patients', 'ver'), listarVacunacionesPorPaciente);
router.get('/:id', verificarToken, verificarPermiso('patients', 'ver'), obtenerVacunacionPorId);
router.post('/', verificarToken, verificarPermiso('patients', 'crear'), crearVacunacion);
router.delete('/:id', verificarToken, verificarPermiso('patients', 'eliminar'), eliminarVacunacion);

module.exports = router;
