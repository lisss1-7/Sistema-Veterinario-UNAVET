const express = require('express');
const {
  listarCatalogo,
  crearCatalogo,
  actualizarCatalogo,
  cambiarEstadoCatalogo,
  eliminarCatalogo,
} = require('../controllers/catalogosProcesoPacientesController');
const { verificarToken } = require('../middleware/authMiddleware');
const { verificarPermiso } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get(
  '/:catalogo',
  verificarToken,
  verificarPermiso('patients', 'ver'),
  listarCatalogo
);
router.post(
  '/:catalogo',
  verificarToken,
  verificarPermiso('patients', 'crear'),
  crearCatalogo
);
router.put(
  '/:catalogo/:id',
  verificarToken,
  verificarPermiso('patients', 'editar'),
  actualizarCatalogo
);
router.patch(
  '/:catalogo/:id/estado',
  verificarToken,
  verificarPermiso('patients', 'editar'),
  cambiarEstadoCatalogo
);
router.delete(
  '/:catalogo/:id',
  verificarToken,
  verificarPermiso('patients', 'eliminar'),
  eliminarCatalogo
);

module.exports = router;
