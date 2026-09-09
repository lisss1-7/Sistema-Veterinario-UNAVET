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
    readOnly: true,
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
    readOnly: true,
  },
  'estados-reproductivos': {
    table: 'estados_reproductivos',
    idColumn: 'estado_reproductivo_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
    readOnly: true,
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
    readOnly: true,
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
    readOnly: true,
  },
  'unidades-intervalo': {
    table: 'unidades_intervalo',
    idColumn: 'unidad_intervalo_id',
    writableColumns: ['nombre', 'dias_por_unidad', 'meses_por_unidad'],
    hasActive: false,
    maxNameLength: 50,
    hasIntervalValues: true,
    extraSelect: ', c.dias_por_unidad, c.meses_por_unidad',
    readOnly: true,
  },
  'tamanos-animales': {
    table: 'tamanos_animales',
    idColumn: 'tamano_animal_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 80,
    readOnly: true,
  },
  'estados-cita': {
    table: 'estados_cita',
    idColumn: 'estado_cita_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 80,
    readOnly: true,
  },
  'tipos-grooming': {
    table: 'tipos_grooming',
    idColumn: 'tipo_grooming_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 100,
    readOnly: true,
  },
  'estados-grooming': {
    table: 'estados_grooming',
    idColumn: 'estado_grooming_id',
    writableColumns: ['nombre'],
    hasActive: false,
    maxNameLength: 80,
    readOnly: true,
  },
  'categorias-inventario': {
    table: 'categorias_inventario',
    idColumn: 'categoria_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 100,
  },
  'estados-producto': {
    table: 'estados_producto',
    idColumn: 'estado_producto_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
    readOnly: true,
  },
  'unidades-medida': {
    table: 'unidades_medida',
    idColumn: 'unidad_medida_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
  },
  'modos-entrega': {
    table: 'modos_entrega_receta',
    idColumn: 'modo_entrega_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 100,
  },
  'categorias-servicio': {
    table: 'categorias_servicio',
    idColumn: 'categoria_servicio_id',
    writableColumns: ['nombre', 'descripcion'],
    hasActive: true,
    maxNameLength: 100,
    hasDescription: true,
    extraSelect: ', c.descripcion',
  },
  servicios: {
    table: 'servicios',
    idColumn: 'servicio_id',
    writableColumns: [
      'categoria_servicio_id',
      'nombre',
      'descripcion',
      'precio_base',
      'controla_inventario',
    ],
    hasActive: true,
    maxNameLength: 180,
    hasDescription: true,
    requiresServiceCategory: true,
    hasPrice: true,
    hasInventoryControl: true,
    extraSelect:
      ', c.categoria_servicio_id, categoria.nombre AS categoria_nombre, c.descripcion, c.precio_base, c.controla_inventario',
    join:
      'INNER JOIN categorias_servicio categoria ON categoria.categoria_servicio_id = c.categoria_servicio_id',
  },
  'estados-vacunacion': {
    table: 'estados_vacunacion',
    idColumn: 'estado_vacunacion_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
    readOnly: true,
  },
  roles: {
    table: 'roles',
    idColumn: 'rol_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
    managesPermissions: true,
  },
  'estados-usuario': {
    table: 'estados_usuario',
    idColumn: 'estado_usuario_id',
    writableColumns: ['nombre'],
    hasActive: true,
    maxNameLength: 80,
    readOnly: true,
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

const normalizeOptionalText = (value, maxLength) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > maxLength || /[\u0000-\u001F\u007F]/.test(text)) {
    return undefined;
  }
  return text || null;
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

  if (config.hasDescription) {
    const descripcion = normalizeOptionalText(body?.descripcion, 255);
    if (descripcion === undefined) {
      return { error: 'La descripción admite hasta 255 caracteres' };
    }
    payload.descripcion = descripcion;
  }

  if (config.requiresServiceCategory) {
    const categoriaId = parsePositiveId(body?.categoria_servicio_id);
    if (!categoriaId) {
      return { error: 'Debe seleccionar una categoría de servicio válida' };
    }
    const [categories] = await db.query(
      `SELECT categoria_servicio_id
       FROM categorias_servicio
       WHERE categoria_servicio_id = ? AND activo = 1
       LIMIT 1`,
      [categoriaId]
    );
    if (categories.length === 0) {
      return { error: 'La categoría seleccionada no existe o está de baja' };
    }
    payload.categoria_servicio_id = categoriaId;
  }

  if (config.hasPrice) {
    const price = parseNullableNonNegativeNumber(body?.precio_base);
    if (price === undefined) {
      return { error: 'El precio base debe ser un número mayor o igual a cero' };
    }
    payload.precio_base = price;
  }

  if (config.hasInventoryControl) {
    const rawValue = body?.controla_inventario;
    if (![true, false, 1, 0, '1', '0'].includes(rawValue)) {
      return { error: 'El control de inventario no es válido' };
    }
    payload.controla_inventario =
      rawValue === true || rawValue === 1 || rawValue === '1' ? 1 : 0;
  }

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
        'No se puede eliminar el registro porque está siendo utilizado en el sistema',
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
    if (config.managesPermissions && rows.length > 0) {
      const [permissionRows] = await db.query(`
        SELECT
          r.rol_id,
          m.codigo,
          m.nombre AS modulo_nombre,
          COALESCE(rp.puede_ver, 0) AS puede_ver,
          COALESCE(rp.puede_crear, 0) AS puede_crear,
          COALESCE(rp.puede_editar, 0) AS puede_editar,
          COALESCE(rp.puede_eliminar, 0) AS puede_eliminar
        FROM roles r
        CROSS JOIN modulos_sistema m
        LEFT JOIN rol_permisos rp
          ON rp.rol_id = r.rol_id
          AND rp.modulo_id = m.modulo_id
        WHERE m.activo = 1
        ORDER BY m.orden, m.nombre
      `);
      const permissionsByRole = new Map();
      permissionRows.forEach((permission) => {
        const rolePermissions = permissionsByRole.get(permission.rol_id) || [];
        rolePermissions.push(permission);
        permissionsByRole.set(permission.rol_id, rolePermissions);
      });
      rows.forEach((row) => {
        row.permisos = permissionsByRole.get(row.id) || [];
      });
    }
    return res.json(rows);
  } catch (error) {
    return handleDatabaseError(res, error, 'Error al listar el catálogo');
  }
};

const normalizeRolePermissions = (value) => {
  if (!Array.isArray(value)) return null;
  const normalized = new Map();
  for (const permission of value) {
    const codigo =
      typeof permission?.codigo === 'string' ? permission.codigo.trim() : '';
    if (!codigo) return null;
    const parsePermission = (rawValue) =>
      rawValue === true || rawValue === 1 || rawValue === '1';
    const puedeCrear = parsePermission(permission.puede_crear);
    const puedeEditar = parsePermission(permission.puede_editar);
    const puedeEliminar = parsePermission(permission.puede_eliminar);
    normalized.set(codigo, {
      codigo,
      puede_ver:
        parsePermission(permission.puede_ver) ||
        puedeCrear ||
        puedeEditar ||
        puedeEliminar,
      puede_crear: puedeCrear,
      puede_editar: puedeEditar,
      puede_eliminar: puedeEliminar,
    });
  }
  return [...normalized.values()];
};

const saveRolePermissions = async (connection, roleId, permissions) => {
  if (permissions.some((permission) => permission === null)) {
    throw Object.assign(new Error('Permisos de rol no válidos'), {
      statusCode: 400,
    });
  }
  await connection.query('DELETE FROM rol_permisos WHERE rol_id = ?', [roleId]);
  for (const permission of permissions) {
    const [insertResult] = await connection.query(
      `INSERT INTO rol_permisos
        (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
       SELECT ?, modulo_id, ?, ?, ?, ?
       FROM modulos_sistema
       WHERE codigo = ? AND activo = 1`,
      [
        roleId,
        permission.puede_ver ? 1 : 0,
        permission.puede_crear ? 1 : 0,
        permission.puede_editar ? 1 : 0,
        permission.puede_eliminar ? 1 : 0,
        permission.codigo,
      ]
    );
    if (insertResult.affectedRows === 0) {
      throw Object.assign(new Error('Uno de los módulos seleccionados no existe'), {
        statusCode: 400,
      });
    }
  }
};

const crearCatalogo = async (req, res) => {
  const config = getCatalogConfig(req.params.catalogo);
  if (!config || config.readOnly) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }

  try {
    const result = await buildPayload(req.body, config);
    if (result.error) return res.status(400).json({ message: result.error });

    if (config.managesPermissions) {
      const permissions = normalizeRolePermissions(req.body?.permisos);
      if (!permissions) {
        return res.status(400).json({ message: 'Debe indicar los permisos del rol' });
      }
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [insertResult] = await connection.query(
          'INSERT INTO roles (nombre) VALUES (?)',
          [result.payload.nombre]
        );
        await saveRolePermissions(connection, insertResult.insertId, permissions);
        await connection.commit();
        return res.status(201).json({
          message: 'Rol creado correctamente',
          id: String(insertResult.insertId),
        });
      } catch (error) {
        await connection.rollback();
        if (error.statusCode) {
          return res.status(error.statusCode).json({ message: error.message });
        }
        return handleDatabaseError(res, error, 'Error al crear el rol');
      } finally {
        connection.release();
      }
    }

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
  if (!config || config.readOnly) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }
  if (!id) {
    return res.status(400).json({ message: 'Identificador no válido' });
  }

  try {
    const result = await buildPayload(req.body, config);
    if (result.error) return res.status(400).json({ message: result.error });

    if (config.managesPermissions) {
      const permissions = normalizeRolePermissions(req.body?.permisos);
      if (!permissions) {
        return res.status(400).json({ message: 'Debe indicar los permisos del rol' });
      }
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [existingRoles] = await connection.query(
          'SELECT rol_id FROM roles WHERE rol_id = ? LIMIT 1 FOR UPDATE',
          [id]
        );
        if (existingRoles.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: 'Rol no encontrado' });
        }
        await connection.query(
          'UPDATE roles SET nombre = ? WHERE rol_id = ?',
          [result.payload.nombre, id]
        );
        await saveRolePermissions(connection, id, permissions);
        await connection.commit();
        return res.json({ message: 'Rol y permisos actualizados correctamente' });
      } catch (error) {
        await connection.rollback();
        if (error.statusCode) {
          return res.status(error.statusCode).json({ message: error.message });
        }
        return handleDatabaseError(res, error, 'Error al actualizar el rol');
      } finally {
        connection.release();
      }
    }

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
  if (!config || config.readOnly) {
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
  if (!config || config.readOnly) {
    return res.status(404).json({ message: 'Catálogo no permitido' });
  }
  if (!id) {
    return res.status(400).json({ message: 'Identificador no válido' });
  }

  try {
    if (req.params.catalogo === 'categorias-servicio') {
      const [services] = await db.query(
        `SELECT servicio_id
         FROM servicios
         WHERE categoria_servicio_id = ? AND activo = 1
         LIMIT 1`,
        [id]
      );
      if (services.length > 0) {
        return res.status(409).json({
          message:
            'No se puede dar de baja la categoría mientras tenga servicios activos',
        });
      }
    }
    if (req.params.catalogo === 'roles') {
      const [users] = await db.query(
        'SELECT usuario_id FROM usuarios WHERE rol_id = ? LIMIT 1',
        [id]
      );
      if (users.length > 0) {
        return res.status(409).json({
          message:
            'No se puede dar de baja el rol mientras esté asignado a usuarios',
        });
      }
    }
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
