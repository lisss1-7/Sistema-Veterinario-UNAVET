const express = require('express');
const {
  listarTutores,
  listarTutoresConPacientes,
  eliminarTutor,
} = require('../controllers/tutoresController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('patients', 'ver'), listarTutores);
router.get('/resumen', verificarToken, verificarPermiso('patients', 'ver'), listarTutoresConPacientes);
router.delete('/:id', verificarToken, verificarPermiso('patients', 'eliminar'), eliminarTutor);

module.exports = router;
