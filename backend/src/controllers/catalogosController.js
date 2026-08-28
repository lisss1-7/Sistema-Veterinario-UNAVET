const db = require('../config/db');

/**
 * Configuración real de los catálogos según la estructura
 * actual de la base de datos unavet_db.
 *
 * Cada catálogo define:
 * - tabla: nombre real en MySQL
 * - idColumn: nombre real de su llave primaria
 * - hasActive: indica si la tabla tiene columna activo
 */
const CATALOGOS = {
  especies: {
    tabla: 'especies',
    idColumn: 'especie_id',
    hasActive: true,
  },

  sexos: {
    tabla: 'sexos',
    idColumn: 'sexo_id',
    hasActive: false,
  },

  estadosReproductivos: {
    tabla: 'estados_reproductivos',
    idColumn: 'estado_reproductivo_id',
    hasActive: false,
  },

  tiposConsulta: {
    tabla: 'tipos_consulta',
    idColumn: 'tipo_consulta_id',
    hasActive: false,
  },

  vacunas: {
    tabla: 'vacunas_catalogo',
    idColumn: 'vacuna_id',
    hasActive: false,
  },

  pruebasLaboratorio: {
    tabla: 'pruebas_laboratorio',
    idColumn: 'prueba_id',
    hasActive: false,
  },

  estadosCita: {
    tabla: 'estados_cita',
    idColumn: 'estado_cita_id',
    hasActive: false,
  },

  tamanosAnimales: {
    tabla: 'tamanos_animales',
    idColumn: 'tamano_animal_id',
    hasActive: false,
  },

  tiposGrooming: {
    tabla: 'tipos_grooming',
    idColumn: 'tipo_grooming_id',
    hasActive: false,
  },

  estadosGrooming: {
    tabla: 'estados_grooming',
    idColumn: 'estado_grooming_id',
    hasActive: false,
  },

  categoriasInventario: {
    tabla: 'categorias_inventario',
    idColumn: 'categoria_id',
    hasActive: true,
  },

  estadosProducto: {
    tabla: 'estados_producto',
    idColumn: 'estado_producto_id',
    hasActive: true,
  },

  tiposTratamiento: {
    tabla: 'tipos_tratamiento',
    idColumn: 'tipo_tratamiento_id',
    hasActive: false,
  },

  estadosTratamiento: {
    tabla: 'estados_tratamiento',
    idColumn: 'estado_tratamiento_id',
    hasActive: false,
  },

  modosEntrega: {
    tabla: 'modos_entrega_receta',
    idColumn: 'modo_entrega_id',
    hasActive: true,
  },

  roles: {
    tabla: 'roles',
    idColumn: 'rol_id',
    hasActive: true,
  },

  unidadesMedida: {
    tabla: 'unidades_medida',
    idColumn: 'unidad_medida_id',
    hasActive: true,
  },

  estadosUsuario: {
    tabla: 'estados_usuario',
    idColumn: 'estado_usuario_id',
    hasActive: true,
  },

  estadosExamenFisico: {
    tabla: 'estados_examen_fisico',
    idColumn: 'estado_examen_id',
    hasActive: false,
  },

  unidadesIntervalo: {
    tabla: 'unidades_intervalo',
    idColumn: 'unidad_intervalo_id',
    hasActive: false,
  },

  estadosVacunacion: {
    tabla: 'estados_vacunacion',
    idColumn: 'estado_vacunacion_id',
    hasActive: true,
  },
};

/**
 * Obtiene un catálogo utilizando su configuración.
 *
 * Todos los catálogos se devuelven con una estructura uniforme:
 *
 * {
 *   id: 1,
 *   nombre: 'Ejemplo'
 * }
 *
 * Las demás columnas de la tabla también se conservan.
 */
const obtenerCatalogo = async (req, res, config) => {
  try {
    if (!config) {
      return res.status(400).json({
        message: 'Configuración de catálogo no válida',
      });
    }

    const {
      tabla,
      idColumn,
      hasActive,
    } = config;

    const filtroActivo = hasActive
      ? 'WHERE activo = 1'
      : '';

    const sql = `
      SELECT
        ${idColumn} AS id,
        ${tabla}.*
      FROM ${tabla}
      ${filtroActivo}
      ORDER BY nombre ASC
    `;

    const [rows] = await db.query(sql);

    res.json(rows);
  } catch (error) {
    console.error(
      `Error al obtener catálogo ${config?.tabla || 'desconocido'}:`,
      error
    );

    res.status(500).json({
      message: `Error al obtener catálogo ${
        config?.tabla || ''
      }`,
      error: error.message,
    });
  }
};

/**
 * ESPECIES
 *
 * GET /api/catalogos/especies
 */
exports.obtenerEspecies = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.especies
  );

/**
 * RAZAS POR ESPECIE
 *
 * GET /api/catalogos/razas/:especie_id
 */
exports.obtenerRazasPorEspecie = async (
  req,
  res
) => {
  try {
    const { especie_id } = req.params;

    const especieId = Number(especie_id);

    if (
      !Number.isInteger(especieId) ||
      especieId <= 0
    ) {
      return res.status(400).json({
        message: 'El identificador de especie no es válido',
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        raza_id AS id,
        raza_id,
        especie_id,
        nombre,
        activo,
        creado_en
      FROM razas
      WHERE especie_id = ?
        AND activo = 1
      ORDER BY nombre ASC
      `,
      [especieId]
    );

    res.json(rows);
  } catch (error) {
    console.error(
      'Error al obtener razas por especie:',
      error
    );

    res.status(500).json({
      message: 'Error al obtener razas',
      error: error.message,
    });
  }
};

/**
 * SEXOS
 *
 * GET /api/catalogos/sexos
 */
exports.obtenerSexos = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.sexos
  );

/**
 * ESTADOS REPRODUCTIVOS
 *
 * GET /api/catalogos/estados-reproductivos
 */
exports.obtenerEstadosReproductivos = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosReproductivos
  );

/**
 * TIPOS DE CONSULTA
 *
 * GET /api/catalogos/tipos-consulta
 */
exports.obtenerTiposConsulta = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.tiposConsulta
  );

/**
 * VACUNAS
 *
 * GET /api/catalogos/vacunas
 */
exports.obtenerVacunas = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.vacunas
  );

/**
 * PRUEBAS DE LABORATORIO
 *
 * GET /api/catalogos/pruebas-laboratorio
 */
exports.obtenerPruebasLaboratorio = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.pruebasLaboratorio
  );

/**
 * ESTADOS DE CITA
 *
 * GET /api/catalogos/estados-cita
 */
exports.obtenerEstadosCita = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosCita
  );

/**
 * TAMAÑOS DE ANIMALES
 *
 * GET /api/catalogos/tamanos-animales
 */
exports.obtenerTamanosAnimales = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.tamanosAnimales
  );

/**
 * TIPOS DE GROOMING
 *
 * GET /api/catalogos/tipos-grooming
 */
exports.obtenerTiposGrooming = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.tiposGrooming
  );

/**
 * ESTADOS DE GROOMING
 *
 * GET /api/catalogos/estados-grooming
 */
exports.obtenerEstadosGrooming = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosGrooming
  );

/**
 * CATEGORÍAS DE INVENTARIO
 *
 * GET /api/catalogos/categorias-inventario
 */
exports.obtenerCategoriasInventario = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.categoriasInventario
  );

/**
 * ESTADOS DEL PRODUCTO
 *
 * GET /api/catalogos/estados-producto
 */
exports.obtenerEstadosProducto = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosProducto
  );

/**
 * TIPOS DE TRATAMIENTO
 *
 * GET /api/catalogos/tipos-tratamiento
 */
exports.obtenerTiposTratamiento = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.tiposTratamiento
  );

/**
 * ESTADOS DE TRATAMIENTO
 *
 * GET /api/catalogos/estados-tratamiento
 */
exports.obtenerEstadosTratamiento = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosTratamiento
  );

/**
 * MODOS DE ENTREGA DE RECETA
 *
 * GET /api/catalogos/modos-entrega-receta
 */
exports.obtenerModosEntrega = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.modosEntrega
  );

/**
 * ROLES
 *
 * GET /api/catalogos/roles
 */
exports.obtenerRoles = (req, res) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.roles
  );

/**
 * ESTADOS DE EXAMEN FÍSICO
 *
 * GET /api/catalogos/estados-examen-fisico
 */
exports.obtenerEstadosExamenFisico = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.estadosExamenFisico
  );

/**
 * UNIDADES DE INTERVALO
 *
 * GET /api/catalogos/unidades-intervalo
 */
exports.obtenerUnidadesIntervalo = (
  req,
  res
) =>
  obtenerCatalogo(
    req,
    res,
    CATALOGOS.unidadesIntervalo
  );

exports.obtenerUnidadesMedida = (req, res) =>
  obtenerCatalogo(req, res, CATALOGOS.unidadesMedida);

exports.obtenerEstadosVacunacion = (req, res) =>
  obtenerCatalogo(req, res, CATALOGOS.estadosVacunacion);

exports.obtenerEstadosUsuario = (req, res) =>
  obtenerCatalogo(req, res, CATALOGOS.estadosUsuario);

exports.obtenerVeterinarios = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        veterinario_id AS id,
        veterinario_id,
        usuario_id,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        CONCAT_WS(
          ' ',
          primer_nombre,
          segundo_nombre,
          primer_apellido,
          segundo_apellido
        ) AS nombre
      FROM veterinarios
      WHERE activo = 1
      ORDER BY primer_apellido, segundo_apellido, primer_nombre, segundo_nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener veterinarios',
      error: error.message,
    });
  }
};

exports.obtenerServicios = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.servicio_id AS id,
        s.nombre,
        s.descripcion,
        s.precio_base,
        cs.nombre AS categoria
      FROM servicios s
      INNER JOIN categorias_servicio cs
        ON cs.categoria_servicio_id = s.categoria_servicio_id
      WHERE s.activo = 1 AND cs.activo = 1
      ORDER BY cs.nombre, s.nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener servicios',
      error: error.message,
    });
  }
};

exports.obtenerFormasPago = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT forma_pago_id AS id, codigo, nombre, orden
      FROM formas_pago
      WHERE activo = 1
      ORDER BY orden, nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener formas de pago',
      error: error.message,
    });
  }
};

exports.obtenerHorarios = async (req, res) => {
  try {
    const { modulo, fecha, tipoGroomingId } = req.query;
    if (!modulo || !fecha) {
      return res.status(400).json({
        message: 'Módulo y fecha son obligatorios',
      });
    }

    const params = [modulo, fecha];
    let groomingFilter = 'AND h.tipo_grooming_id IS NULL';
    if (tipoGroomingId) {
      groomingFilter = 'AND h.tipo_grooming_id = ?';
      params.push(tipoGroomingId);
    }

    const [rows] = await db.query(
      `
      SELECT
        h.horario_id,
        TIME_FORMAT(h.hora_inicio, '%H:%i') AS hora_inicio,
        TIME_FORMAT(h.hora_fin, '%H:%i') AS hora_fin,
        h.intervalo_minutos,
        h.capacidad_diaria
      FROM horarios_atencion h
      INNER JOIN modulos_sistema m ON m.modulo_id = h.modulo_id
      WHERE m.codigo = ?
        AND h.dia_semana = DAYOFWEEK(?) - 1
        AND h.activo = 1
        ${groomingFilter}
      LIMIT 1
      `,
      params
    );

    if (rows.length === 0) {
      return res.json({ slots: [], capacity: null });
    }

    const config = rows[0];
    const toMinutes = (value) => {
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    const formatMinutes = (value) =>
      `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
        value % 60
      ).padStart(2, '0')}`;

    const slots = [];
    const start = toMinutes(config.hora_inicio);
    const end = toMinutes(config.hora_fin);
    const interval = Number(config.intervalo_minutos);
    for (let current = start; current <= end; current += interval) {
      slots.push(formatMinutes(current));
    }

    res.json({
      slots,
      capacity:
        config.capacidad_diaria === null
          ? null
          : Number(config.capacidad_diaria),
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener horarios',
      error: error.message,
    });
  }
};

exports.obtenerMisModulos = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        m.codigo,
        m.nombre,
        m.ruta,
        m.orden,
        rp.puede_ver,
        rp.puede_crear,
        rp.puede_editar,
        rp.puede_eliminar
      FROM usuarios u
      INNER JOIN estados_usuario eu
        ON eu.estado_usuario_id = u.estado_usuario_id
      INNER JOIN rol_permisos rp ON rp.rol_id = u.rol_id
      INNER JOIN modulos_sistema m ON m.modulo_id = rp.modulo_id
      WHERE u.usuario_id = ?
        AND eu.permite_acceso = 1
        AND m.activo = 1
        AND rp.puede_ver = 1
      ORDER BY m.orden
      `,
      [req.user?.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener permisos del usuario',
      error: error.message,
    });
  }
};

exports.obtenerModulosSistema = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT codigo, nombre, ruta, orden
      FROM modulos_sistema
      WHERE activo = 1
      ORDER BY orden, nombre
      `
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener los mÃ³dulos del sistema',
      error: error.message,
    });
  }
};
