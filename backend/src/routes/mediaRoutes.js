const express = require('express');
const { servirImagen } = require('../controllers/mediaController');

const router = express.Router();

router.get('/:bucket/:filename', servirImagen);

module.exports = router;
