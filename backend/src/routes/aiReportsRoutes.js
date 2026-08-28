const express = require('express');
const { generarReporteIA } = require('../controllers/aiReportsController');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/chat', verificarToken, generarReporteIA);

module.exports = router;
