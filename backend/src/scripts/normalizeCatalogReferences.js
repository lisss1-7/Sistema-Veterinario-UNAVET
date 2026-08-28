const pool = require('../config/db');

const columnExists = async (connection, table, column) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [table, column]
  );
  return rows.length > 0;
};

const indexExists = async (connection, table, index) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
    [table, index]
  );
  return rows.length > 0;
};

const constraintExists = async (connection, constraint) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
    [constraint]
  );
  return rows.length > 0;
};

const addColumn = async (connection, table, column, definition) => {
  if (!(await columnExists(connection, table, column))) {
    await connection.query(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
};

const dropColumn = async (connection, table, column) => {
  if (await columnExists(connection, table, column)) {
    await connection.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
};

const splitLegacyName = (value) => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: 'Sin nombre',
      middleName: null,
      firstSurname: 'Sin apellido',
      secondSurname: null,
    };
  }
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      middleName: null,
      firstSurname: 'Sin apellido',
      secondSurname: null,
    };
  }
  if (parts.length === 2) {
    return {
      firstName: parts[0],
      middleName: null,
      firstSurname: parts[1],
      secondSurname: null,
    };
  }
  if (parts.length === 3) {
    return {
      firstName: parts[0],
      middleName: null,
      firstSurname: parts[1],
      secondSurname: parts[2],
    };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -2).join(' '),
    firstSurname: parts.at(-2),
    secondSurname: parts.at(-1),
  };
};

const addTutorSnapshotColumns = async (connection, table) => {
  await addColumn(
    connection,
    table,
    'tutor_primer_nombre',
    'VARCHAR(80) NULL AFTER nombre_mascota'
  );
  await addColumn(
    connection,
    table,
    'tutor_segundo_nombre',
    'VARCHAR(80) NULL AFTER tutor_primer_nombre'
  );
  await addColumn(
    connection,
    table,
    'tutor_primer_apellido',
    'VARCHAR(80) NULL AFTER tutor_segundo_nombre'
  );
  await addColumn(
    connection,
    table,
    'tutor_segundo_apellido',
    'VARCHAR(80) NULL AFTER tutor_primer_apellido'
  );

  await connection.query(`
    UPDATE ${table} target
    INNER JOIN tutores tutor ON tutor.tutor_id = target.tutor_id
    SET
      target.tutor_primer_nombre =
        COALESCE(target.tutor_primer_nombre, tutor.primer_nombre),
      target.tutor_segundo_nombre =
        COALESCE(target.tutor_segundo_nombre, tutor.segundo_nombre),
      target.tutor_primer_apellido =
        COALESCE(target.tutor_primer_apellido, tutor.primer_apellido),
      target.tutor_segundo_apellido =
        COALESCE(target.tutor_segundo_apellido, tutor.segundo_apellido)
    WHERE target.tutor_primer_nombre IS NULL
       OR target.tutor_primer_apellido IS NULL
  `);

  if (await columnExists(connection, table, 'nombre_tutor')) {
    const [rows] = await connection.query(
      `
      SELECT
        ${table === 'citas_clinicas' ? 'cita_id' : 'grooming_id'} AS id,
        nombre_tutor
      FROM ${table}
      WHERE tutor_primer_nombre IS NULL
         OR tutor_primer_apellido IS NULL
      `
    );
    const idColumn =
      table === 'citas_clinicas' ? 'cita_id' : 'grooming_id';

    for (const row of rows) {
      const parts = splitLegacyName(row.nombre_tutor);
      await connection.query(
        `
        UPDATE ${table}
        SET
          tutor_primer_nombre = ?,
          tutor_segundo_nombre = ?,
          tutor_primer_apellido = ?,
          tutor_segundo_apellido = ?
        WHERE ${idColumn} = ?
        `,
        [
          parts.firstName,
          parts.middleName,
          parts.firstSurname,
          parts.secondSurname,
          row.id,
        ]
      );
    }
  }

  const [[missing]] = await connection.query(`
    SELECT COUNT(*) AS total
    FROM ${table}
    WHERE tutor_primer_nombre IS NULL
       OR TRIM(tutor_primer_nombre) = ''
       OR tutor_primer_apellido IS NULL
       OR TRIM(tutor_primer_apellido) = ''
  `);
  if (Number(missing.total) > 0) {
    throw new Error(
      `No se pudo separar el nombre del tutor en ${table}.`
    );
  }

  await connection.query(`
    ALTER TABLE ${table}
      MODIFY tutor_primer_nombre VARCHAR(80) NOT NULL,
      MODIFY tutor_segundo_nombre VARCHAR(80) NULL,
      MODIFY tutor_primer_apellido VARCHAR(80) NOT NULL,
      MODIFY tutor_segundo_apellido VARCHAR(80) NULL
  `);
};

const requireReference = async (
  connection,
  {
    table,
    column,
    definition,
    constraint,
    catalogTable,
    catalogColumn,
  }
) => {
  const [[missing]] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IS NULL`
  );
  if (Number(missing.total) > 0) {
    throw new Error(
      `${table}.${column} todavía tiene ${missing.total} referencia(s) vacía(s).`
    );
  }

  if (await constraintExists(connection, constraint)) {
    await connection.query(
      `ALTER TABLE ${table} DROP FOREIGN KEY ${constraint}`
    );
  }
  await connection.query(
    `ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition} NOT NULL`
  );
  await connection.query(`
    ALTER TABLE ${table}
    ADD CONSTRAINT ${constraint}
      FOREIGN KEY (${column}) REFERENCES ${catalogTable}(${catalogColumn})
      ON DELETE RESTRICT ON UPDATE CASCADE
  `);
};

const syncCatalogReferences = async (connection) => {
  if (await columnExists(connection, 'pacientes', 'sexo')) {
    await connection.query(`
    UPDATE pacientes target
    INNER JOIN sexos catalogo ON catalogo.nombre = target.sexo
    SET target.sexo_id = catalogo.sexo_id
    WHERE target.sexo_id IS NULL
    `);
  }
  if (await columnExists(connection, 'pacientes', 'estado_reproductivo')) {
    await connection.query(`
    UPDATE pacientes target
    INNER JOIN estados_reproductivos catalogo
      ON catalogo.nombre = target.estado_reproductivo
    SET target.estado_reproductivo_id = catalogo.estado_reproductivo_id
    WHERE target.estado_reproductivo_id IS NULL
    `);
  }
  if (await columnExists(connection, 'citas_clinicas', 'estado')) {
    await connection.query(`
    UPDATE citas_clinicas target
    INNER JOIN estados_cita catalogo ON catalogo.nombre = target.estado
    SET target.estado_cita_id = catalogo.estado_cita_id
    WHERE target.estado_cita_id IS NULL
    `);
  }
  if (await columnExists(connection, 'citas_clinicas', 'tamano_mascota')) {
    await connection.query(`
    UPDATE citas_clinicas target
    INNER JOIN tamanos_animales catalogo
      ON catalogo.nombre = target.tamano_mascota
    SET target.tamano_animal_id = catalogo.tamano_animal_id
    WHERE target.tamano_animal_id IS NULL
    `);
  }
  if (await columnExists(connection, 'citas_grooming', 'estado')) {
    await connection.query(`
    UPDATE citas_grooming target
    INNER JOIN estados_grooming catalogo ON catalogo.nombre = target.estado
    SET target.estado_grooming_id = catalogo.estado_grooming_id
    WHERE target.estado_grooming_id IS NULL
    `);
  }
  if (await columnExists(connection, 'citas_grooming', 'modalidad')) {
    await connection.query(`
    UPDATE citas_grooming target
    INNER JOIN tipos_grooming catalogo
      ON catalogo.modalidad_legacy = target.modalidad
    SET target.tipo_grooming_id = catalogo.tipo_grooming_id
    WHERE target.tipo_grooming_id IS NULL
    `);
  }
  if (await columnExists(connection, 'citas_grooming', 'tamano_mascota')) {
    await connection.query(`
    UPDATE citas_grooming target
    INNER JOIN tamanos_animales catalogo
      ON catalogo.nombre = target.tamano_mascota
    SET target.tamano_animal_id = catalogo.tamano_animal_id
    WHERE target.tamano_animal_id IS NULL
    `);
  }
  if (await columnExists(connection, 'historial_clinico', 'tipo_consulta')) {
    await connection.query(`
    UPDATE historial_clinico target
    INNER JOIN tipos_consulta catalogo
      ON LOWER(TRIM(catalogo.nombre)) = LOWER(TRIM(target.tipo_consulta))
    SET target.tipo_consulta_id = catalogo.tipo_consulta_id
    WHERE target.tipo_consulta_id IS NULL
    `);
  }
  if (await columnExists(connection, 'tratamientos_servicios', 'tipo')) {
    await connection.query(`
    UPDATE tratamientos_servicios target
    INNER JOIN tipos_tratamiento catalogo
      ON catalogo.valor_legacy = target.tipo
    SET target.tipo_tratamiento_id = catalogo.tipo_tratamiento_id
    WHERE target.tipo_tratamiento_id IS NULL
    `);
  }
  if (
    await columnExists(
      connection,
      'tratamientos_servicios',
      'estado_presentacion'
    )
  ) {
    await connection.query(`
    UPDATE tratamientos_servicios target
    INNER JOIN estados_tratamiento catalogo
      ON catalogo.nombre = target.estado_presentacion
    SET target.estado_tratamiento_id = catalogo.estado_tratamiento_id
    WHERE target.estado_tratamiento_id IS NULL
    `);
  }
  if (await columnExists(connection, 'usuarios', 'estado')) {
    await connection.query(`
    UPDATE usuarios target
    INNER JOIN estados_usuario catalogo ON catalogo.nombre = target.estado
    SET target.estado_usuario_id = catalogo.estado_usuario_id
    WHERE target.estado_usuario_id IS NULL
    `);
  }

  await connection.query(`
    UPDATE productos_inventario producto
    INNER JOIN estados_producto estado_actual
      ON estado_actual.estado_producto_id = producto.estado_producto_id
    INNER JOIN estados_producto estado_correcto
      ON estado_correcto.activo = 1
     AND (
       (producto.stock_actual <= 0 AND estado_correcto.sin_existencias = 1)
       OR
       (producto.stock_actual > 0 AND estado_correcto.es_inicial = 1)
     )
    SET producto.estado_producto_id = estado_correcto.estado_producto_id
    WHERE estado_actual.nombre <> 'Inactivo'
  `);
};

const run = async () => {
  const connection = await pool.getConnection();

  try {
    if (!(await columnExists(
      connection,
      'productos_inventario',
      'estado_producto_id'
    ))) {
      console.log(
        'Las referencias ya corresponden al esquema normalizado final.'
      );
      return;
    }

    console.log('Separando nombres históricos de tutores...');
    await addTutorSnapshotColumns(connection, 'citas_clinicas');
    await addTutorSnapshotColumns(connection, 'citas_grooming');

    await addColumn(
      connection,
      'citas_grooming',
      'tamano_animal_id',
      'INT NULL AFTER raza'
    );
    if (
      !(await constraintExists(
        connection,
        'fk_citas_grooming_tamano_animal'
      ))
    ) {
      await connection.query(`
        ALTER TABLE citas_grooming
        ADD CONSTRAINT fk_citas_grooming_tamano_animal
          FOREIGN KEY (tamano_animal_id)
          REFERENCES tamanos_animales(tamano_animal_id)
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    console.log('Completando claves de catálogo...');
    await syncCatalogReferences(connection);

    const requiredReferences = [
      {
        table: 'pacientes',
        column: 'sexo_id',
        definition: 'INT',
        constraint: 'fk_pacientes_sexo_id',
        catalogTable: 'sexos',
        catalogColumn: 'sexo_id',
      },
      {
        table: 'citas_clinicas',
        column: 'estado_cita_id',
        definition: 'INT',
        constraint: 'fk_citas_clinicas_estado_cita_id',
        catalogTable: 'estados_cita',
        catalogColumn: 'estado_cita_id',
      },
      {
        table: 'citas_grooming',
        column: 'tipo_grooming_id',
        definition: 'INT',
        constraint: 'fk_citas_grooming_tipo_grooming_id',
        catalogTable: 'tipos_grooming',
        catalogColumn: 'tipo_grooming_id',
      },
      {
        table: 'citas_grooming',
        column: 'estado_grooming_id',
        definition: 'INT',
        constraint: 'fk_citas_grooming_estado_grooming_id',
        catalogTable: 'estados_grooming',
        catalogColumn: 'estado_grooming_id',
      },
      {
        table: 'productos_inventario',
        column: 'estado_producto_id',
        definition: 'INT',
        constraint: 'fk_productos_inventario_estado_producto_id',
        catalogTable: 'estados_producto',
        catalogColumn: 'estado_producto_id',
      },
      {
        table: 'historial_clinico',
        column: 'tipo_consulta_id',
        definition: 'INT',
        constraint: 'fk_historial_clinico_tipo_consulta_id',
        catalogTable: 'tipos_consulta',
        catalogColumn: 'tipo_consulta_id',
      },
      {
        table: 'tratamientos_servicios',
        column: 'tipo_tratamiento_id',
        definition: 'INT',
        constraint: 'fk_tratamientos_tipo_catalogo',
        catalogTable: 'tipos_tratamiento',
        catalogColumn: 'tipo_tratamiento_id',
      },
      {
        table: 'tratamientos_servicios',
        column: 'estado_tratamiento_id',
        definition: 'INT',
        constraint: 'fk_tratamientos_servicios_estado_tratamiento_id',
        catalogTable: 'estados_tratamiento',
        catalogColumn: 'estado_tratamiento_id',
      },
      {
        table: 'usuarios',
        column: 'estado_usuario_id',
        definition: 'INT UNSIGNED',
        constraint: 'fk_usuarios_estado_usuario_id',
        catalogTable: 'estados_usuario',
        catalogColumn: 'estado_usuario_id',
      },
    ];
    for (const reference of requiredReferences) {
      await requireReference(connection, reference);
    }

    if (await columnExists(connection, 'citas_grooming', 'precio')) {
      await connection.query(`
        UPDATE citas_grooming
        SET
          costo_grooming = COALESCE(costo_grooming, precio, 0),
          costo_transporte = COALESCE(costo_transporte, 0)
      `);
    } else {
      await connection.query(`
        UPDATE citas_grooming
        SET
          costo_grooming = COALESCE(costo_grooming, 0),
          costo_transporte = COALESCE(costo_transporte, 0)
      `);
    }
    await connection.query(`
      ALTER TABLE citas_grooming
        MODIFY costo_grooming DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY costo_transporte DECIMAL(10,2) NOT NULL DEFAULT 0
    `);

    console.log('Retirando columnas de texto duplicadas...');
    const obsoleteColumns = [
      ['pacientes', 'sexo'],
      ['pacientes', 'estado_reproductivo'],
      ['citas_clinicas', 'nombre_tutor'],
      ['citas_clinicas', 'tamano_mascota'],
      ['citas_clinicas', 'estado'],
      ['citas_grooming', 'nombre_tutor'],
      ['citas_grooming', 'tamano_mascota'],
      ['citas_grooming', 'tipo_servicio'],
      ['citas_grooming', 'modalidad'],
      ['citas_grooming', 'precio'],
      ['citas_grooming', 'estado'],
      ['productos_inventario', 'estado'],
      ['historial_clinico', 'tipo_consulta'],
      ['tratamientos_servicios', 'tipo'],
      ['tratamientos_servicios', 'estado'],
      ['tratamientos_servicios', 'estado_presentacion'],
      ['usuarios', 'estado'],
      ['tipos_grooming', 'modalidad_legacy'],
      ['tipos_tratamiento', 'valor_legacy'],
      ['estados_tratamiento', 'valor_legacy'],
    ];
    for (const [table, column] of obsoleteColumns) {
      await dropColumn(connection, table, column);
    }

    if (
      !(await indexExists(
        connection,
        'citas_clinicas',
        'idx_citas_validacion_horario_catalogo'
      ))
    ) {
      await connection.query(`
        ALTER TABLE citas_clinicas
        ADD KEY idx_citas_validacion_horario_catalogo
          (fecha, hora, estado_cita_id)
      `);
    }
    if (
      !(await indexExists(
        connection,
        'citas_grooming',
        'idx_grooming_validacion_horario_catalogo'
      ))
    ) {
      await connection.query(`
        ALTER TABLE citas_grooming
        ADD KEY idx_grooming_validacion_horario_catalogo
          (fecha, hora, estado_grooming_id)
      `);
    }

    console.log('Referencias de catálogo normalizadas correctamente.');
  } finally {
    connection.release();
  }
};

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
