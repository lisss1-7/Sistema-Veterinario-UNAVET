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

const MODULE_BY_CATALOG = Object.freeze({
  'categorias-inventario': 'inventory',
  'unidades-medida': 'inventory',
  'tipos-tratamiento': 'prescriptions',
  'modos-entrega': 'prescriptions',
  'estados-tratamiento': 'prescriptions',
  'categorias-servicio': 'prescriptions',
  servicios: 'prescriptions',
  roles: 'users',
  'estados-usuario': 'users',
});

const verificarPermisoCatalogo = (accion) => (req, res, next) => {
  const modulo = MODULE_BY_CATALOG[req.params.catalogo] || 'patients';
  return verificarPermiso(modulo, accion)(req, res, next);
};

router.get(
  '/:catalogo',
  verificarToken,
  verificarPermisoCatalogo('ver'),
  listarCatalogo
);
router.post(
  '/:catalogo',
  verificarToken,
  verificarPermisoCatalogo('crear'),
  crearCatalogo
);
router.put(
  '/:catalogo/:id',
  verificarToken,
  verificarPermisoCatalogo('editar'),
  actualizarCatalogo
);
router.patch(
  '/:catalogo/:id/estado',
  verificarToken,
  verificarPermisoCatalogo('editar'),
  cambiarEstadoCatalogo
);
router.delete(
  '/:catalogo/:id',
  verificarToken,
  verificarPermisoCatalogo('eliminar'),
  eliminarCatalogo
);

module.exports = router;
