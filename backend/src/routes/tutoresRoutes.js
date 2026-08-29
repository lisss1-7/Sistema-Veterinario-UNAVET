const express = require('express');
const { listarTutores } = require('../controllers/tutoresController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', verificarToken, verificarPermiso('patients', 'ver'), listarTutores);

module.exports = router;
