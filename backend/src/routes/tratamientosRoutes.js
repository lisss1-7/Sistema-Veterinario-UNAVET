const express = require('express');
const {
  listarTratamientos,
  listarTratamientosPorPaciente,
  obtenerTratamientoPorId,
  crearTratamiento,
  eliminarTratamiento,
} = require('../controllers/tratamientosController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('patients', 'ver'), listarTratamientos);
router.get('/paciente/:pacienteId', verificarToken, verificarPermiso('patients', 'ver'), listarTratamientosPorPaciente);
router.get('/:id', verificarToken, verificarPermiso('patients', 'ver'), obtenerTratamientoPorId);
router.post('/', verificarToken, verificarPermiso('patients', 'crear'), crearTratamiento);
router.delete('/:id', verificarToken, verificarPermiso('patients', 'eliminar'), eliminarTratamiento);

module.exports = router;
