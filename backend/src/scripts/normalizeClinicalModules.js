const pool = require('../config/db');

const tableExists = async (connection, table) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
};

const columnExists = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
};

const constraintExists = async (connection, constraint) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [constraint]
  );
  return rows.length > 0;
};

const normalizePhysicalExam = async (connection) => {
  await connection.query(`
    INSERT INTO estados_examen_fisico (nombre)
    VALUES ('No evaluado')
    ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS parametros_examen_fisico (
      parametro_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      codigo VARCHAR(50) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      orden SMALLINT UNSIGNED NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (parametro_id),
      UNIQUE KEY uq_parametro_examen_codigo (codigo),
      UNIQUE KEY uq_parametro_examen_nombre (nombre),
      UNIQUE KEY uq_parametro_examen_orden (orden),
      CONSTRAINT chk_parametro_examen_activo CHECK (activo IN (0, 1))
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Catálogo de aspectos que se evalúan durante el examen físico.'
  `);

  const parameters = [
    ['piel_mucosas', 'Piel/Mucosas', 1],
    ['ojos', 'Ojos', 2],
    ['respiratorio', 'Respiratorio', 3],
    ['oidos', 'Oídos', 4],
    ['nervioso', 'Nervioso', 5],
    ['genitourinario', 'Genito/Urinario', 6],
    ['nodulos', 'Nódulos', 7],
    ['presion', 'Presión', 8],
  ];
  for (const parameter of parameters) {
    await connection.query(
      `INSERT INTO parametros_examen_fisico (codigo, nombre, orden, activo)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         orden = VALUES(orden),
         activo = 1`,
      parameter
    );
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS historial_examen_fisico (
      historial_id BIGINT UNSIGNED NOT NULL,
      parametro_id INT UNSIGNED NOT NULL,
      estado_examen_id INT NOT NULL,
      observacion VARCHAR(255) NULL,
      PRIMARY KEY (historial_id, parametro_id),
      KEY idx_historial_examen_estado (estado_examen_id),
      CONSTRAINT fk_historial_examen_historial
        FOREIGN KEY (historial_id)
        REFERENCES historial_clinico (historial_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_historial_examen_parametro
        FOREIGN KEY (parametro_id)
        REFERENCES parametros_examen_fisico (parametro_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_historial_examen_estado
        FOREIGN KEY (estado_examen_id)
        REFERENCES estados_examen_fisico (estado_examen_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Resultados normalizados del examen físico de cada consulta.'
  `);

  const legacyMapping = [
    ['mucosa', 'piel_mucosas'],
    ['ojos', 'ojos'],
    ['respiratorio', 'respiratorio'],
    ['oidos', 'oidos'],
    ['motilidad', 'nervioso'],
    ['conjuntiva', 'genitourinario'],
    ['palpitaciones', 'nodulos'],
    ['prurito', 'presion'],
  ];
  for (const [legacyColumn, code] of legacyMapping) {
    if (await columnExists(connection, 'historial_clinico', legacyColumn)) {
      await connection.query(`
        INSERT INTO historial_examen_fisico (
          historial_id,
          parametro_id,
          estado_examen_id
        )
        SELECT
          historial.historial_id,
          parametro.parametro_id,
          estado.estado_examen_id
        FROM historial_clinico historial
        INNER JOIN parametros_examen_fisico parametro
          ON parametro.codigo = ?
        INNER JOIN estados_examen_fisico estado
          ON estado.nombre = historial.${legacyColumn}
        WHERE historial.${legacyColumn} IS NOT NULL
        ON DUPLICATE KEY UPDATE
          estado_examen_id = VALUES(estado_examen_id)
      `, [code]);
    }
  }

  for (const [legacyColumn] of legacyMapping) {
    if (await columnExists(connection, 'historial_clinico', legacyColumn)) {
      await connection.query(
        `ALTER TABLE historial_clinico DROP COLUMN ${legacyColumn}`
      );
    }
  }
};

const normalizeVaccinations = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS esquemas_vacunacion_paciente (
      esquema_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      paciente_id BIGINT UNSIGNED NOT NULL,
      vacuna_id INT NOT NULL,
      dosis_totales SMALLINT UNSIGNED NOT NULL,
      intervalo SMALLINT UNSIGNED NULL,
      unidad_intervalo_id INT NULL,
      observaciones TEXT NULL,
      creado_por BIGINT UNSIGNED NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (esquema_id),
      KEY idx_esquema_vacunacion_paciente (paciente_id),
      KEY idx_esquema_vacunacion_vacuna (vacuna_id),
      KEY idx_esquema_vacunacion_unidad (unidad_intervalo_id),
      CONSTRAINT fk_esquema_vacunacion_paciente
        FOREIGN KEY (paciente_id)
        REFERENCES pacientes (paciente_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_esquema_vacunacion_vacuna
        FOREIGN KEY (vacuna_id)
        REFERENCES vacunas_catalogo (vacuna_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_esquema_vacunacion_unidad
        FOREIGN KEY (unidad_intervalo_id)
        REFERENCES unidades_intervalo (unidad_intervalo_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_esquema_vacunacion_usuario
        FOREIGN KEY (creado_por)
        REFERENCES usuarios (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT chk_esquema_dosis_totales CHECK (dosis_totales > 0),
      CONSTRAINT chk_esquema_intervalo CHECK (
        intervalo IS NULL OR intervalo > 0
      )
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Esquemas de vacunación indicados a cada paciente.'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS aplicaciones_vacuna (
      aplicacion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      esquema_id BIGINT UNSIGNED NOT NULL,
      numero_dosis SMALLINT UNSIGNED NOT NULL,
      fecha_aplicacion DATE NULL,
      fecha_desconocida TINYINT(1) NOT NULL DEFAULT 0,
      lote VARCHAR(80) NULL,
      veterinario_id BIGINT UNSIGNED NULL,
      creado_por BIGINT UNSIGNED NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (aplicacion_id),
      UNIQUE KEY uq_aplicacion_esquema_dosis (esquema_id, numero_dosis),
      KEY idx_aplicacion_fecha (fecha_aplicacion),
      KEY idx_aplicacion_veterinario (veterinario_id),
      CONSTRAINT fk_aplicacion_vacuna_esquema
        FOREIGN KEY (esquema_id)
        REFERENCES esquemas_vacunacion_paciente (esquema_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_aplicacion_vacuna_veterinario
        FOREIGN KEY (veterinario_id)
        REFERENCES veterinarios (veterinario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_aplicacion_vacuna_usuario
        FOREIGN KEY (creado_por)
        REFERENCES usuarios (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT chk_aplicacion_numero CHECK (numero_dosis > 0),
      CONSTRAINT chk_aplicacion_fecha CHECK (
        (fecha_desconocida = 0 AND fecha_aplicacion IS NOT NULL)
        OR (fecha_desconocida = 1 AND fecha_aplicacion IS NULL)
      )
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Cada dosis de vacuna aplicada dentro de un esquema.'
  `);

  if (await tableExists(connection, 'vacunaciones')) {
    const [vaccinations] = await connection.query(`
      SELECT *
      FROM vacunaciones
      ORDER BY vacunacion_id
    `);

    for (const vaccination of vaccinations) {
      const appliedDoses = Math.min(
        Number(vaccination.dosis_aplicadas || 0),
        Number(vaccination.dosis_totales || 1)
      );
      const interval = Number(vaccination.intervalo || 0);
      await connection.query(
        `INSERT IGNORE INTO esquemas_vacunacion_paciente (
           esquema_id,
           paciente_id,
           vacuna_id,
           dosis_totales,
           intervalo,
           unidad_intervalo_id,
           observaciones,
           creado_por,
           creado_en,
           actualizado_en
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vaccination.vacunacion_id,
          vaccination.paciente_id,
          vaccination.vacuna_catalogo_id,
          Math.max(1, Number(vaccination.dosis_totales || 1)),
          interval > 0 ? interval : null,
          interval > 0 ? vaccination.unidad_intervalo_id : null,
          vaccination.observaciones,
          vaccination.creado_por,
          vaccination.creado_en,
          vaccination.actualizado_en,
        ]
      );

      for (let dose = 1; dose <= appliedDoses; dose += 1) {
        const isLatestKnownDose = dose === appliedDoses;
        await connection.query(
          `INSERT IGNORE INTO aplicaciones_vacuna (
             esquema_id,
             numero_dosis,
             fecha_aplicacion,
             fecha_desconocida,
             lote,
             veterinario_id,
             creado_por,
             creado_en,
             actualizado_en
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vaccination.vacunacion_id,
            dose,
            isLatestKnownDose ? vaccination.fecha_aplicacion : null,
            isLatestKnownDose ? 0 : 1,
            isLatestKnownDose ? vaccination.lote : null,
            isLatestKnownDose ? vaccination.veterinario_id : null,
            vaccination.creado_por,
            vaccination.creado_en,
            vaccination.actualizado_en,
          ]
        );
      }
    }

    const [[oldCount], [schemeCount]] = await Promise.all([
      connection.query('SELECT COUNT(*) AS total FROM vacunaciones'),
      connection.query(
        `SELECT COUNT(*) AS total
         FROM esquemas_vacunacion_paciente
         WHERE esquema_id IN (SELECT vacunacion_id FROM vacunaciones)`
      ),
    ]);
    if (Number(oldCount[0].total) !== Number(schemeCount[0].total)) {
      throw new Error('No se pudieron verificar todos los esquemas migrados');
    }
    await connection.query('DROP TABLE vacunaciones');
  }
};

const normalizeLaboratoryAndCategories = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS categorias_tratamiento (
      categoria_tratamiento_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nombre VARCHAR(120) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (categoria_tratamiento_id),
      UNIQUE KEY uq_categoria_tratamiento_nombre (nombre),
      CONSTRAINT chk_categoria_tratamiento_activo CHECK (activo IN (0, 1))
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='Catálogo de categorías para tratamientos y servicios.'
  `);

  if (!(await columnExists(
    connection,
    'tratamientos_servicios',
    'categoria_tratamiento_id'
  ))) {
    await connection.query(`
      ALTER TABLE tratamientos_servicios
      ADD COLUMN categoria_tratamiento_id INT UNSIGNED NULL
    `);
  }
  if (!(await columnExists(
    connection,
    'tratamientos_servicios',
    'prueba_laboratorio_id'
  ))) {
    await connection.query(`
      ALTER TABLE tratamientos_servicios
      ADD COLUMN prueba_laboratorio_id INT NULL
    `);
  }

  if (await columnExists(connection, 'tratamientos_servicios', 'categoria')) {
    await connection.query(`
      INSERT INTO categorias_tratamiento (nombre)
      SELECT DISTINCT TRIM(categoria)
      FROM tratamientos_servicios
      WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
      ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
    `);
    await connection.query(`
      UPDATE tratamientos_servicios tratamiento
      INNER JOIN categorias_tratamiento categoria
        ON categoria.nombre = TRIM(tratamiento.categoria)
      SET tratamiento.categoria_tratamiento_id =
        categoria.categoria_tratamiento_id
      WHERE tratamiento.categoria IS NOT NULL
    `);
  }

  if (await columnExists(connection, 'tratamientos_servicios', 'nombre')) {
    await connection.query(`
      INSERT INTO pruebas_laboratorio (nombre)
      SELECT DISTINCT TRIM(tratamiento.nombre)
      FROM tratamientos_servicios tratamiento
      INNER JOIN tipos_tratamiento tipo
        ON tipo.tipo_tratamiento_id = tratamiento.tipo_tratamiento_id
      WHERE tipo.nombre = 'Servicio de laboratorio'
        AND tratamiento.nombre IS NOT NULL
        AND TRIM(tratamiento.nombre) <> ''
      ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
    `);
    await connection.query(`
      UPDATE tratamientos_servicios tratamiento
      INNER JOIN tipos_tratamiento tipo
        ON tipo.tipo_tratamiento_id = tratamiento.tipo_tratamiento_id
       AND tipo.nombre = 'Servicio de laboratorio'
      INNER JOIN pruebas_laboratorio prueba
        ON prueba.nombre = TRIM(tratamiento.nombre)
      SET
        tratamiento.prueba_laboratorio_id = prueba.prueba_id,
        tratamiento.nombre = NULL
    `);
  }

  if (!(await constraintExists(
    connection,
    'fk_tratamiento_categoria_catalogo'
  ))) {
    await connection.query(`
      ALTER TABLE tratamientos_servicios
      ADD CONSTRAINT fk_tratamiento_categoria_catalogo
        FOREIGN KEY (categoria_tratamiento_id)
        REFERENCES categorias_tratamiento (categoria_tratamiento_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }
  if (!(await constraintExists(
    connection,
    'fk_tratamiento_prueba_laboratorio'
  ))) {
    await connection.query(`
      ALTER TABLE tratamientos_servicios
      ADD CONSTRAINT fk_tratamiento_prueba_laboratorio
        FOREIGN KEY (prueba_laboratorio_id)
        REFERENCES pruebas_laboratorio (prueba_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }

  await connection.query(`
    ALTER TABLE tratamientos_servicios
    MODIFY nombre VARCHAR(150) NULL
  `);

  if (await columnExists(connection, 'tratamientos_servicios', 'categoria')) {
    await connection.query(`
      ALTER TABLE tratamientos_servicios DROP COLUMN categoria
    `);
  }
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    console.log('Normalizando examen físico...');
    await normalizePhysicalExam(connection);
    console.log('Separando esquemas y aplicaciones de vacunas...');
    await normalizeVaccinations(connection);
    console.log('Normalizando pruebas y categorías de tratamiento...');
    await normalizeLaboratoryAndCategories(connection);
    console.log('Normalización de módulos clínicos completada.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Falló la normalización de módulos clínicos:', error);
  process.exitCode = 1;
});
