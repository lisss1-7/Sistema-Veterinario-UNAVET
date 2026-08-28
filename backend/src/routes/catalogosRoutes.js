const express = require('express');

const {
  obtenerEspecies,
  obtenerRazasPorEspecie,
  obtenerSexos,
  obtenerEstadosReproductivos,
  obtenerTiposConsulta,
  obtenerVacunas,
  obtenerPruebasLaboratorio,
  obtenerEstadosCita,
  obtenerTamanosAnimales,

  // Grooming
  obtenerTiposGrooming,
  obtenerEstadosGrooming,

  // Inventario
  obtenerCategoriasInventario,
  obtenerEstadosProducto,
  obtenerUnidadesMedida,

  // Tratamientos / Recetas / Expediente
  obtenerTiposTratamiento,
  obtenerEstadosTratamiento,
  obtenerModosEntrega,
  obtenerRoles,
  obtenerEstadosExamenFisico,
  obtenerUnidadesIntervalo,
  obtenerEstadosVacunacion,
  obtenerServicios,
  obtenerFormasPago,
  obtenerHorarios,
  obtenerMisModulos,
  obtenerModulosSistema,
  obtenerEstadosUsuario,
  obtenerVeterinarios,
} = require('../controllers/catalogosController');

const { verificarToken } = require('../middleware/authMiddleware');
const catalogosProcesoPacientesRoutes = require('./catalogosProcesoPacientesRoutes');

const router = express.Router();

router.use('/proceso-pacientes', catalogosProcesoPacientesRoutes);

/**
 * PACIENTES
 */
router.get('/especies', verificarToken, obtenerEspecies);
router.get('/razas/:especie_id', verificarToken, obtenerRazasPorEspecie);
router.get('/sexos', verificarToken, obtenerSexos);
router.get(
  '/estados-reproductivos',
  verificarToken,
  obtenerEstadosReproductivos
);

/**
 * CITAS
 */
router.get('/estados-cita', verificarToken, obtenerEstadosCita);
router.get('/tamanos-animales', verificarToken, obtenerTamanosAnimales);

/**
 * GROOMING
 *
 * Estas son las rutas que necesita Grooming.tsx:
 * GET /api/catalogos/tipos-grooming
 * GET /api/catalogos/estados-grooming
 */
router.get('/tipos-grooming', verificarToken, obtenerTiposGrooming);
router.get('/estados-grooming', verificarToken, obtenerEstadosGrooming);

/**
 * PATIENT DETAIL / EXPEDIENTE
 */
router.get('/tipos-consulta', verificarToken, obtenerTiposConsulta);
router.get('/vacunas', verificarToken, obtenerVacunas);
router.get('/pruebas-laboratorio', verificarToken, obtenerPruebasLaboratorio);
router.get('/tipos-tratamiento', verificarToken, obtenerTiposTratamiento);
router.get('/estados-tratamiento', verificarToken, obtenerEstadosTratamiento);
router.get('/estados-examen-fisico', verificarToken, obtenerEstadosExamenFisico);
router.get('/unidades-intervalo', verificarToken, obtenerUnidadesIntervalo);
router.get('/estados-vacunacion', verificarToken, obtenerEstadosVacunacion);
router.get('/veterinarios', verificarToken, obtenerVeterinarios);

/**
 * INVENTARIO
 */
router.get('/categorias-inventario', verificarToken, obtenerCategoriasInventario);
router.get('/estados-producto', verificarToken, obtenerEstadosProducto);
router.get('/unidades-medida', verificarToken, obtenerUnidadesMedida);

/**
 * RECETAS / USUARIOS
 */
router.get('/modos-entrega-receta', verificarToken, obtenerModosEntrega);
router.get('/roles', verificarToken, obtenerRoles);
router.get('/estados-usuario', verificarToken, obtenerEstadosUsuario);
router.get('/servicios', verificarToken, obtenerServicios);
router.get('/formas-pago', verificarToken, obtenerFormasPago);
router.get('/horarios', verificarToken, obtenerHorarios);
router.get('/mis-modulos', verificarToken, obtenerMisModulos);
router.get('/modulos-sistema', verificarToken, obtenerModulosSistema);

module.exports = router;
