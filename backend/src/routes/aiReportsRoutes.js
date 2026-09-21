const express = require('express');
const { generarReporteIA } = require('../controllers/aiReportsController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.post('/chat', verificarToken, verificarPermiso('aiReports', 'crear'), generarReporteIA);

module.exports = router;
