const express = require('express');
const { obtenerResumenDashboard } = require('../controllers/dashboardController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/resumen', verificarToken, verificarPermiso('dashboard', 'ver'), obtenerResumenDashboard);

module.exports = router;
