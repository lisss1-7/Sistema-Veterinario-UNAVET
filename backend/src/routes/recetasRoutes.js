const express = require('express');

const {
  listarRecetas,
  obtenerRecetaPorId,
  crearReceta,
  actualizarReceta,
  anularReceta,
} = require('../controllers/recetasController');

const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/recetas
 * Lista todas las recetas.
 */
router.get('/', verificarToken, listarRecetas);

/**
 * GET /api/recetas/:id
 * Obtiene una receta con sus medicamentos.
 */
router.get('/:id', verificarToken, obtenerRecetaPorId);

/**
 * POST /api/recetas
 * Crea una nueva receta.
 */
router.post('/', verificarToken, crearReceta);

/**
 * PUT /api/recetas/:id
 * Actualiza una receta existente y reajusta el inventario.
 */
router.put('/:id', verificarToken, actualizarReceta);

/**
 * PATCH /api/recetas/:id/anular
 * Cambia el estado de la receta a Anulada.
 */
router.patch('/:id/anular', verificarToken, anularReceta);

module.exports = router;