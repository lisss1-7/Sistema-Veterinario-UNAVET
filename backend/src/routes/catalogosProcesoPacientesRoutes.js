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

const verificarAdministrador = (req, res, next) => {
  if (String(req.user?.rol || '').trim().toLowerCase() !== 'administrador') {
    return res.status(403).json({
      message: 'Solo el administrador puede acceder a mantenimiento',
    });
  }
  next();
};

router.use(verificarToken, verificarAdministrador);

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
  verificarPermisoCatalogo('ver'),
  listarCatalogo
);
router.post(
  '/:catalogo',
  verificarPermisoCatalogo('crear'),
  crearCatalogo
);
router.put(
  '/:catalogo/:id',
  verificarPermisoCatalogo('editar'),
  actualizarCatalogo
);
router.patch(
  '/:catalogo/:id/estado',
  verificarPermisoCatalogo('editar'),
  cambiarEstadoCatalogo
);
router.delete(
  '/:catalogo/:id',
  verificarPermisoCatalogo('eliminar'),
  eliminarCatalogo
);

module.exports = router;
