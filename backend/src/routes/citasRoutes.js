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

const router = express.Router();

router.get('/', verificarToken, listarCitas);
router.get('/:id', verificarToken, obtenerCitaPorId);
router.post('/', verificarToken, crearCita);
router.put('/:id', verificarToken, actualizarCita);
router.patch('/:id/estado', verificarToken, cambiarEstadoCita);
router.delete('/:id', verificarToken, eliminarCita);

module.exports = router;