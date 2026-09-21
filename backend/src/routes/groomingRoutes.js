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
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('grooming', 'ver'), listarGrooming);
router.get('/:id', verificarToken, verificarPermiso('grooming', 'ver'), obtenerGroomingPorId);
router.post('/', verificarToken, verificarPermiso('grooming', 'crear'), crearGrooming);
router.put('/:id', verificarToken, verificarPermiso('grooming', 'editar'), actualizarGrooming);
router.patch('/:id/estado', verificarToken, verificarPermiso('grooming', 'editar'), cambiarEstadoGrooming);
router.delete('/:id', verificarToken, verificarPermiso('grooming', 'eliminar'), eliminarGrooming);

module.exports = router;
