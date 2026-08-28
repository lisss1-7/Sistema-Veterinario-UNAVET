const express = require('express');
const {
  listarPacientes,
  obtenerPacientePorId,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente,
} = require('../controllers/pacientesController');

const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('patients', 'ver'), listarPacientes);
router.get('/:id', verificarToken, verificarPermiso('patients', 'ver'), obtenerPacientePorId);
router.post('/', verificarToken, verificarPermiso('patients', 'crear'), crearPaciente);
router.put('/:id', verificarToken, verificarPermiso('patients', 'editar'), actualizarPaciente);
router.delete('/:id', verificarToken, verificarPermiso('patients', 'eliminar'), eliminarPaciente);

module.exports = router;
