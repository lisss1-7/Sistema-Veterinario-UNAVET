const SYNC_QUERIES = {
  pacientes: `
    UPDATE pacientes target
    LEFT JOIN sexos sex ON sex.nombre = target.sexo
    LEFT JOIN estados_reproductivos reproductive
      ON reproductive.nombre = target.estado_reproductivo
    SET target.sexo_id = sex.sexo_id,
        target.estado_reproductivo_id = reproductive.estado_reproductivo_id
    WHERE target.paciente_id = ?
  `,
  citas_clinicas: `
    UPDATE citas_clinicas target
    LEFT JOIN estados_cita status_catalog ON status_catalog.nombre = target.estado
    LEFT JOIN tamanos_animales size_catalog
      ON size_catalog.nombre = target.tamano_mascota
    SET target.estado_cita_id = status_catalog.estado_cita_id,
        target.tamano_animal_id = size_catalog.tamano_animal_id
    WHERE target.cita_id = ?
  `,
  citas_grooming: `
    UPDATE citas_grooming target
    LEFT JOIN tipos_grooming type_catalog
      ON type_catalog.modalidad_legacy = target.modalidad
    LEFT JOIN estados_grooming status_catalog
      ON status_catalog.nombre = target.estado
    SET target.tipo_grooming_id = type_catalog.tipo_grooming_id,
        target.estado_grooming_id = status_catalog.estado_grooming_id
    WHERE target.grooming_id = ?
  `,
  productos_inventario: `
    UPDATE productos_inventario target
    LEFT JOIN estados_producto catalog ON catalog.nombre = target.estado
    SET target.estado_producto_id = catalog.estado_producto_id
    WHERE target.producto_id = ?
  `,
  historial_clinico: `
    UPDATE historial_clinico target
    LEFT JOIN tipos_consulta catalog ON catalog.nombre = target.tipo_consulta
    SET target.tipo_consulta_id = catalog.tipo_consulta_id
    WHERE target.historial_id = ?
  `,
  tratamientos_servicios: `
    UPDATE tratamientos_servicios target
    LEFT JOIN tipos_tratamiento type_catalog
      ON type_catalog.nombre =
        CASE target.tipo
          WHEN 'Tratamiento' THEN 'Tratamiento médico'
          WHEN 'Laboratorio' THEN 'Servicio de laboratorio'
          ELSE target.tipo
        END
    LEFT JOIN estados_tratamiento status_catalog
      ON status_catalog.nombre = target.estado_presentacion
    SET target.tipo_tratamiento_id = type_catalog.tipo_tratamiento_id,
        target.estado_tratamiento_id = status_catalog.estado_tratamiento_id
    WHERE target.tratamiento_id = ?
  `,
  vacunaciones: `
    UPDATE vacunaciones target
    LEFT JOIN vacunas_catalogo catalog ON catalog.nombre = target.nombre_vacuna
    SET target.vacuna_catalogo_id = catalog.vacuna_id
    WHERE target.vacunacion_id = ?
  `,
  usuarios: `
    UPDATE usuarios target
    LEFT JOIN estados_usuario catalog ON catalog.nombre = target.estado
    SET target.estado_usuario_id = catalog.estado_usuario_id
    WHERE target.usuario_id = ?
  `,
};

const syncCatalogIds = async (connection, entity, id) => {
  const query = SYNC_QUERIES[entity];
  if (!query) throw new Error(`Sin configuración de catálogo para ${entity}`);
  await connection.query(query, [id]);
};

module.exports = { syncCatalogIds };
