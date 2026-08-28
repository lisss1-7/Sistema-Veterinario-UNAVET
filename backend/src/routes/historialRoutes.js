const express = require('express');
const {
  listarHistorialPorPaciente,
  obtenerHistorialPorId,
  crearHistorial,
  actualizarHistorial,
  eliminarHistorial,
} = require('../controllers/historialController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/paciente/:pacienteId', verificarToken, verificarPermiso('patients', 'ver'), listarHistorialPorPaciente);
router.get('/:id', verificarToken, verificarPermiso('patients', 'ver'), obtenerHistorialPorId);
router.post('/', verificarToken, verificarPermiso('patients', 'crear'), crearHistorial);
router.put('/:id', verificarToken, verificarPermiso('patients', 'editar'), actualizarHistorial);
router.delete('/:id', verificarToken, verificarPermiso('patients', 'eliminar'), eliminarHistorial);

module.exports = router;
