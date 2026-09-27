const express = require('express');
const {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
  restaurarUsuario,
} = require('../controllers/usuariosController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('users', 'ver'), listarUsuarios);
router.get('/:id', verificarToken, verificarPermiso('users', 'ver'), obtenerUsuarioPorId);
router.post('/', verificarToken, verificarPermiso('users', 'crear'), crearUsuario);
router.put('/:id', verificarToken, verificarPermiso('users', 'editar'), actualizarUsuario);
router.patch('/:id/estado', verificarToken, verificarPermiso('users', 'editar'), cambiarEstadoUsuario);
router.patch('/:id/restaurar', verificarToken, verificarPermiso('users', 'eliminar'), restaurarUsuario);
router.delete('/:id', verificarToken, verificarPermiso('users', 'eliminar'), eliminarUsuario);

module.exports = router;
