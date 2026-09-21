const express = require('express');

const {
  listarRecetas,
  obtenerRecetaPorId,
  crearReceta,
  actualizarReceta,
  anularReceta,
} = require('../controllers/recetasController');

const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');
const { listarProductos } = require('../controllers/inventarioController');

const router = express.Router();

/**
 * GET /api/recetas
 * Lista todas las recetas.
 */
router.get('/', verificarToken, verificarPermiso('prescriptions', 'ver'), listarRecetas);

// La receta necesita consultar existencias aunque el rol no tenga acceso al
// mantenimiento completo de inventario.
router.get(
  '/inventario-disponible',
  verificarToken,
  verificarPermiso('prescriptions', 'ver'),
  listarProductos
);

/**
 * GET /api/recetas/:id
 * Obtiene una receta con sus medicamentos.
 */
router.get('/:id', verificarToken, verificarPermiso('prescriptions', 'ver'), obtenerRecetaPorId);

/**
 * POST /api/recetas
 * Crea una nueva receta.
 */
router.post('/', verificarToken, verificarPermiso('prescriptions', 'crear'), crearReceta);

/**
 * PUT /api/recetas/:id
 * Actualiza una receta existente y reajusta el inventario.
 */
router.put('/:id', verificarToken, verificarPermiso('prescriptions', 'editar'), actualizarReceta);

/**
 * PATCH /api/recetas/:id/anular
 * Cambia el estado de la receta a Anulada.
 */
router.patch('/:id/anular', verificarToken, verificarPermiso('prescriptions', 'eliminar'), anularReceta);

module.exports = router;
