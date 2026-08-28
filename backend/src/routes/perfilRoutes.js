const express = require('express');
const {
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
} = require('../controllers/perfilController');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', verificarToken, obtenerPerfil);
router.put('/me', verificarToken, actualizarPerfil);
router.patch('/me/password', verificarToken, cambiarPassword);

module.exports = router;
