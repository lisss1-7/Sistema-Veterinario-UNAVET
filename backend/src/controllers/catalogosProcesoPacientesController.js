const db = require('../config/db');

// Las rutas reciben una clave de catálogo, nunca un nombre de tabla. Todos los
// identificadores SQL que se interpolan provienen exclusivamente de esta
// allowlist cerrada.
const PATIENT_PROCESS_CATALOGS = Object.freeze({
  especies: {
    table: 'especies',
    idColumn: 'especie_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
    extraSelect: ', c.creado_en',
  },
  razas: {
    table: 'razas',
    idColumn: 'raza_id',
    writableColumns: ['especie_id', 'nombre'],
    hasActive: true,
    maxNameLength: 100,
    requiresSpecies: true,
    extraSelect:
      ', c.especie_id, especie.nombre AS especie_nombre, especie.activo AS especie_activa, c.creado_en',
    join: 'INNER JOIN especies especie ON especie.especie_id = c.especie_id',
  },
  sexos: {
    table: 'sexos',
    idColumn: 'sexo_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 50,
  },
  'estados-reproductivos': {
    table: 'estados_reproductivos',
    idColumn: 'estado_reproductivo_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
  },
  'tipos-consulta': {
    table: 'tipos_consulta',
    idColumn: 'tipo_consulta_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
  },
  vacunas: {
    table: 'vacunas_catalogo',
    idColumn: 'vacuna_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 150,
  },
  'pruebas-laboratorio': {
    table: 'pruebas_laboratorio',
    idColumn: 'prueba_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 150,
  },
  'tipos-tratamiento': {
    table: 'tipos_tratamiento',
    idColumn: 'tipo_tratamiento_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 150,
  },
  'estados-tratamiento': {
    table: 'estados_tratamiento',
    idColumn: 'estado_tratamiento_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
  },
  'estados-examen-fisico': {
    table: 'estados_examen_fisico',
    idColumn: 'estado_examen_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
  },
  'unidades-intervalo': {
    table: 'unidades_intervalo',
    idColumn: 'unidad_intervalo_id',
    writableColumns: ['nombre', 'dias_por_unidad', 'meses_por_unidad'],
    hasActive: false,
    maxNameLength: 50,
    hasIntervalValues: true,
    extraSelect: ', c.dias_por_unidad, c.meses_por_unidad',
  },
});

const getCatalogConfig = (catalogKey) =>
  PATIENT_PROCESS_CATALOGS[catalogKey] || null;

const parsePositiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeName = (value, maxLength) => {
  if (typeof value !== 'string') return null;

  const name = value.trim().replace(/\s+/g, ' ');
  if (
    !name ||
    name.length > maxLength ||
    /[\u0000-\u001F\u007F]/.test(name)
  ) {
    return null;
  }

  return name;
};

const parseNullableNonNegativeNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;

  return parsed;
};

const buildPayload = async (body, config) => {
  const nombre = normalizeName(body?.nombre, config.maxNameLength);
  if (!nombre) {
    return {
      error: `El nombre es obligatorio y admite hasta ${config.maxNameLength} caracteres`,
    };
  }

  const payload = { nombre };

  if (config.requiresSpecies) {
    const especieId = parsePositiveId(body?.especie_id);
    if (!especieId) {
      return { error: 'Debe seleccionar una especie válida' };
    }

    const [species] = await db.query(
      'SELECT especie_id FROM especies WHERE especie_id = ? LIMIT 1',
      [especieId]
    );
    if (species.length === 0) {
      return { error: 'La especie seleccionada no existe' };
    }

    payload.especie_id = especieId;
  }

  if (config.hasIntervalValues) {
    const dias = parseNullableNonNegativeNumber(body?.dias_por_unidad);
    const meses = parseNullableNonNegativeNumber(body?.meses_por_unidad);
    if (dias === undefined || meses === undefined) {
      return {
        error: 'Los valores de días y meses deben ser números mayores o iguales a cero',
      };
    }

    const positiveConversions = [dias, meses].filter(
      (value) => value !== null && value > 0
    );
    if (positiveConversions.length !== 1) {
      return {
        error:
          'Debe indicar una sola conversión positiva: días por unidad o meses por unidad',
      };
    }

    payload.dias_por_unidad = dias && dias > 0 ? dias : null;
    payload.meses_por_unidad = meses && meses > 0 ? meses : null;
  }

  return { payload };
};

const handleDatabaseError = (res, error, fallbackMessage) => {
  if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
    return res.status(409).json({
      message: 'Ya existe un registro con esos datos en el catálogo',
    });
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2' || error?.errno === 1451) {
    return res.status(409).json({
      message:
        'No se puede eliminar el registro porque está siendo utilizado por el proceso de pacientes',
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
};

const listarCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  if (!config) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }

  try {
    const activeSelect = config.hasActive ? ', c.activo' : '';
    const sql = `
      SELECT
        c.${config.idColumn} AS id,
        c.${config.idColumn},
        c.nombre
        ${activeSelect}
        ${config.extraSelect || ''}
      FROM ${config.table} c
      ${config.join || ''}
      ORDER BY c.nombre ASC, c.${config.idColumn} ASC
    `;
    const [rows] = await db.query(sql);
    return res.json(rows);
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al listar el catálogo');
  }
};

const crearCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  if (!config) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }

  try {
    const result = await buildPayload(req.body, config);
    if (result.error) return res.status(400).json({ message: result.error });

    const columns = config.writableColumns;
    const values = columns.map((column) => result.payload[column]);
    const placeholders = columns.map(() => '?').join(', ');
    const [insertResult] = await db.query(
      `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return res.status(201).json({
      message: 'Registro creado correctamente',
      id: String(insertResult.insertId),
    });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al crear el registro');
  }
};

const actualizarCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  const id = parsePositiveId(req.params.id);
  if (!config) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }
  if (!id) {
    return res.status(400).json({ message: 'Identificador no válido' });
  }

  try {
    const result = await buildPayload(req.body, config);
    if (result.error) return res.status(400).json({ message: result.error });

    const columns = config.writableColumns;
    const assignments = columns.map((column) => `${column} = ?`).join(', ');
    const values = columns.map((column) => result.payload[column]);
    const [updateResult] = await db.query(
      `UPDATE ${config.table} SET ${assignments} WHERE ${config.idColumn} = ?`,
      [...values, id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }

    return res.json({ message: 'Registro actualizado correctamente' });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al actualizar el registro');
  }
};

const cambiarEstadoCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  const id = parsePositiveId(req.params.id);
  if (!config) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }
  if (!config.hasActive) {
    return res.status(400).json({
      message: 'Este catálogo no admite baja lógica ni reactivación',
    });
  }
  if (!id) {
    return res.status(400).json({ message: 'Identificador no válido' });
  }

  const rawActive = req.body?.activo;
  if (![true, false, 1, 0, '1', '0'].includes(rawActive)) {
    return res.status(400).json({ message: 'El estado activo no es válido' });
  }
  const activo = rawActive === true || rawActive === 1 || rawActive === '1';

  try {
    const [updateResult] = await db.query(
      `UPDATE ${config.table} SET activo = ? WHERE ${config.idColumn} = ?`,
      [activo ? 1 : 0, id]
    );
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }

    return res.json({
      message: activo
        ? 'Registro reactivado correctamente'
        : 'Registro dado de baja correctamente',
    });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al cambiar el estado');
  }
};

const eliminarCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  const id = parsePositiveId(req.params.id);
  if (!config) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }
  if (!id) {
    return res.status(400).json({ message: 'Identificador no válido' });
  }

  try {
    const sql = config.hasActive
      ? `UPDATE ${config.table} SET activo = 0 WHERE ${config.idColumn} = ?`
      : `DELETE FROM ${config.table} WHERE ${config.idColumn} = ?`;
    const [deleteResult] = await db.query(sql, [id]);
    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }

    return res.json({
      message: config.hasActive
        ? 'Registro dado de baja correctamente'
        : 'Registro eliminado correctamente',
    });
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al eliminar el registro');
  }
};

module.exports = {
  listarCatalogo,
  crearCatalogo,
  actualizarCatalogo,
  cambiarEstadoCatalogo,
  eliminarCatalogo,
};
