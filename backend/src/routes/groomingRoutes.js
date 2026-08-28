const express = require('express');
const {
  listarGrooming,
  obtenerGroomingPorId,
  crearGrooming,
  actualizarGrooming,
  cambiarEstadoGrooming,
  eliminarGrooming,
} = require('../controllers/groomingController');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', verificarToken, listarGrooming);
router.get('/:id', verificarToken, obtenerGroomingPorId);
router.post('/', verificarToken, crearGrooming);
router.put('/:id', verificarToken, actualizarGrooming);
router.patch('/:id/estado', verificarToken, cambiarEstadoGrooming);
router.delete('/:id', verificarToken, eliminarGrooming);

module.exports = router;
