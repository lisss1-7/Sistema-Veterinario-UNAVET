const express = require('express');
const { obtenerResumenDashboard } = require('../controllers/dashboardController');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/resumen', verificarToken, obtenerResumenDashboard);

module.exports = router;
