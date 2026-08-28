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

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ');

const parsePersonName = (value) => {
  const cleaned = String(value || '')
    .replace(/^(dr|dra|doctor|doctora)\.?\s+/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

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

const getVeterinarianKey = (parts) =>
  normalizeText(
    [
      parts.firstName,
      parts.middleName,
      parts.firstSurname,
      parts.secondSurname,
    ]
      .filter(Boolean)
      .join(' ')
  );

const ensureVeterinarian = async (connection, rawName, cache) => {
  const normalized = normalizeText(rawName);
  if (
    !normalized ||
    normalized === 'pendiente de asignar' ||
    normalized === 'sin asignar'
  ) {
    return null;
  }

  const parsed = parsePersonName(rawName);
  if (!parsed) return null;
  const key = getVeterinarianKey(parsed);
  if (cache.has(key)) return cache.get(key);

  const [result] = await connection.query(
    `
    INSERT INTO veterinarios (
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      activo
    )
    VALUES (?, ?, ?, ?, 1)
    `,
    [
      parsed.firstName,
      parsed.middleName,
      parsed.firstSurname,
      parsed.secondSurname,
    ]
  );
  cache.set(key, result.insertId);
  return result.insertId;
};

const parseRecipeExtra = (value) => {
  if (!value) return { observations: null, veterinarian: null };
  try {
    const parsed = JSON.parse(value);
    return {
      observations: parsed.observations || null,
      veterinarian: parsed.veterinarian || null,
    };
  } catch {
    return { observations: value, veterinarian: null };
  }
};

const parseAgeMonths = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const years = normalized.match(/(\d+(?:[.,]\d+)?)\s*(ano|anos|año|años)/);
  if (years) {
    return Math.max(
      0,
      Math.round(Number(years[1].replace(',', '.')) * 12)
    );
  }
  const months = normalized.match(/(\d+(?:[.,]\d+)?)\s*(mes|meses)/);
  if (months) {
    return Math.max(0, Math.round(Number(months[1].replace(',', '.'))));
  }
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return Math.max(
      0,
      Math.round(Number(normalized.replace(',', '.')) * 12)
    );
  }
  return null;
};

const migrateAgeColumn = async (
  connection,
  { table, idColumn, referenceDateColumn }
) => {
  if (!(await columnExists(connection, table, 'edad'))) return;

  const [rows] = await connection.query(
    `
    SELECT ${idColumn} AS id, edad
    FROM ${table}
    WHERE fecha_nacimiento IS NULL
      AND edad IS NOT NULL
      AND TRIM(edad) <> ''
    `
  );
  for (const row of rows) {
    const months = parseAgeMonths(row.edad);
    if (months === null) continue;
    await connection.query(
      `
      UPDATE ${table}
      SET
        fecha_nacimiento =
          DATE_SUB(${referenceDateColumn}, INTERVAL ? MONTH),
        fecha_nacimiento_aproximada = 1
      WHERE ${idColumn} = ?
      `,
      [months, row.id]
    );
  }
};

const addForeignKey = async (
  connection,
  table,
  constraint,
  definition
) => {
  if (!(await constraintExists(connection, constraint))) {
    await connection.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} ${definition}`
    );
  }
};

const normalizeVeterinarians = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS veterinarios (
      veterinario_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id BIGINT UNSIGNED NULL,
      primer_nombre VARCHAR(80) NOT NULL,
      segundo_nombre VARCHAR(80) NULL,
      primer_apellido VARCHAR(80) NOT NULL,
      segundo_apellido VARCHAR(80) NULL,
      numero_colegiado VARCHAR(50) NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (veterinario_id),
      UNIQUE KEY uq_veterinarios_usuario (usuario_id),
      UNIQUE KEY uq_veterinarios_colegiado (numero_colegiado),
      KEY idx_veterinarios_apellidos_nombres
        (primer_apellido, segundo_apellido, primer_nombre, segundo_nombre),
      CONSTRAINT fk_veterinarios_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    INSERT INTO veterinarios (
      usuario_id,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      activo
    )
    SELECT
      usuario.usuario_id,
      usuario.primer_nombre,
      usuario.segundo_nombre,
      COALESCE(NULLIF(usuario.primer_apellido, ''), 'Sin apellido'),
      usuario.segundo_apellido,
      1
    FROM usuarios usuario
    INNER JOIN roles rol ON rol.rol_id = usuario.rol_id
    WHERE LOWER(rol.nombre) LIKE '%veterinario%'
    ON DUPLICATE KEY UPDATE
      primer_nombre = VALUES(primer_nombre),
      segundo_nombre = VALUES(segundo_nombre),
      primer_apellido = VALUES(primer_apellido),
      segundo_apellido = VALUES(segundo_apellido),
      activo = 1
  `);

  const sources = [
    ['historial_clinico', 'historial_id'],
    ['tratamientos_servicios', 'tratamiento_id'],
    ['vacunaciones', 'vacunacion_id'],
  ];
  for (const [table] of sources) {
    await addColumn(
      connection,
      table,
      'veterinario_id',
      'BIGINT UNSIGNED NULL'
    );
  }
  await addColumn(
    connection,
    'recetas',
    'veterinario_id',
    'BIGINT UNSIGNED NULL AFTER historial_id'
  );

  const [existing] = await connection.query(`
    SELECT
      veterinario_id,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido
    FROM veterinarios
  `);
  const cache = new Map(
    existing.map((row) => [
      getVeterinarianKey({
        firstName: row.primer_nombre,
        middleName: row.segundo_nombre,
        firstSurname: row.primer_apellido,
        secondSurname: row.segundo_apellido,
      }),
      row.veterinario_id,
    ])
  );

  for (const [table, idColumn] of sources) {
    if (!(await columnExists(connection, table, 'veterinario'))) continue;
    const [rows] = await connection.query(
      `
      SELECT ${idColumn} AS id, veterinario
      FROM ${table}
      WHERE veterinario_id IS NULL
        AND veterinario IS NOT NULL
      `
    );
    for (const row of rows) {
      const veterinarianId = await ensureVeterinarian(
        connection,
        row.veterinario,
        cache
      );
      if (veterinarianId) {
        await connection.query(
          `UPDATE ${table} SET veterinario_id = ? WHERE ${idColumn} = ?`,
          [veterinarianId, row.id]
        );
      }
    }
  }

  const [recipes] = await connection.query(`
    SELECT receta_id, observaciones
    FROM recetas
    WHERE veterinario_id IS NULL
       OR (observaciones IS NOT NULL AND JSON_VALID(observaciones))
  `);
  for (const recipe of recipes) {
    const extra = parseRecipeExtra(recipe.observaciones);
    const veterinarianId = await ensureVeterinarian(
      connection,
      extra.veterinarian,
      cache
    );
    await connection.query(
      `
      UPDATE recetas
      SET observaciones = ?, veterinario_id = COALESCE(veterinario_id, ?)
      WHERE receta_id = ?
      `,
      [extra.observations, veterinarianId, recipe.receta_id]
    );
  }

  for (const [table] of sources) {
    await addForeignKey(
      connection,
      table,
      `fk_${table}_veterinario`,
      `FOREIGN KEY (veterinario_id)
       REFERENCES veterinarios(veterinario_id)
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
    await dropColumn(connection, table, 'veterinario');
  }
  await addForeignKey(
    connection,
    'recetas',
    'fk_recetas_veterinario',
    `FOREIGN KEY (veterinario_id)
     REFERENCES veterinarios(veterinario_id)
     ON DELETE SET NULL ON UPDATE CASCADE`
  );
};

const normalizeBirthDates = async (connection) => {
  await addColumn(
    connection,
    'pacientes',
    'fecha_nacimiento',
    'DATE NULL AFTER nombre'
  );
  await addColumn(
    connection,
    'pacientes',
    'fecha_nacimiento_aproximada',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER fecha_nacimiento'
  );
  await migrateAgeColumn(connection, {
    table: 'pacientes',
    idColumn: 'paciente_id',
    referenceDateColumn: 'fecha_registro',
  });

  await addColumn(
    connection,
    'citas_grooming',
    'fecha_nacimiento',
    'DATE NULL AFTER nombre_mascota'
  );
  await addColumn(
    connection,
    'citas_grooming',
    'fecha_nacimiento_aproximada',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER fecha_nacimiento'
  );
  await connection.query(`
    UPDATE citas_grooming grooming
    INNER JOIN pacientes paciente
      ON paciente.paciente_id = grooming.paciente_id
    SET
      grooming.fecha_nacimiento =
        COALESCE(grooming.fecha_nacimiento, paciente.fecha_nacimiento),
      grooming.fecha_nacimiento_aproximada =
        paciente.fecha_nacimiento_aproximada
    WHERE grooming.fecha_nacimiento IS NULL
  `);
  await migrateAgeColumn(connection, {
    table: 'citas_grooming',
    idColumn: 'grooming_id',
    referenceDateColumn: 'fecha',
  });

  await dropColumn(connection, 'pacientes', 'edad');
  await dropColumn(connection, 'pacientes', 'ultima_visita');
  await dropColumn(connection, 'citas_grooming', 'edad');
};

const normalizePrescriptionCatalogs = async (connection) => {
  await connection.query(`
    INSERT INTO modos_entrega_receta (
      nombre,
      descripcion,
      activo,
      descuenta_inventario
    )
    SELECT
      'Compra externa',
      'El medicamento debe adquirirse fuera de la clínica',
      1,
      0
    WHERE NOT EXISTS (
      SELECT 1
      FROM modos_entrega_receta
      WHERE nombre = 'Compra externa'
    )
  `);

  if (
    await columnExists(connection, 'receta_medicamentos', 'modo_entrega')
  ) {
    await connection.query(`
      UPDATE receta_medicamentos medicamento
      INNER JOIN modos_entrega_receta modo
        ON modo.nombre = medicamento.modo_entrega
      SET medicamento.modo_entrega_id = modo.modo_entrega_id
      WHERE medicamento.modo_entrega_id IS NULL
    `);
  }

  const [[missingModes]] = await connection.query(`
    SELECT COUNT(*) AS total
    FROM receta_medicamentos
    WHERE modo_entrega_id IS NULL
  `);
  if (Number(missingModes.total) > 0) {
    throw new Error('Hay medicamentos de receta sin modo de entrega válido.');
  }
  if (
    await constraintExists(
      connection,
      'fk_receta_medicamentos_modo_entrega_id'
    )
  ) {
    await connection.query(`
      ALTER TABLE receta_medicamentos
      DROP FOREIGN KEY fk_receta_medicamentos_modo_entrega_id
    `);
  }
  await connection.query(`
    ALTER TABLE receta_medicamentos
      MODIFY modo_entrega_id INT NOT NULL,
      ADD CONSTRAINT fk_receta_medicamentos_modo_entrega_id
        FOREIGN KEY (modo_entrega_id)
        REFERENCES modos_entrega_receta(modo_entrega_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
  `);
  await dropColumn(connection, 'receta_medicamentos', 'modo_entrega');
  await dropColumn(
    connection,
    'receta_medicamentos',
    'descuenta_inventario'
  );

  await connection.query(`
    CREATE TABLE IF NOT EXISTS estados_receta (
      estado_receta_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nombre VARCHAR(50) NOT NULL,
      es_inicial TINYINT(1) NOT NULL DEFAULT 0,
      es_anulado TINYINT(1) NOT NULL DEFAULT 0,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (estado_receta_id),
      UNIQUE KEY uq_estados_receta_nombre (nombre)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    INSERT INTO estados_receta (nombre, es_inicial, es_anulado, activo)
    VALUES
      ('Activa', 1, 0, 1),
      ('Anulada', 0, 1, 1)
    ON DUPLICATE KEY UPDATE
      es_inicial = VALUES(es_inicial),
      es_anulado = VALUES(es_anulado),
      activo = VALUES(activo)
  `);
  await addColumn(
    connection,
    'recetas',
    'estado_receta_id',
    'INT UNSIGNED NULL AFTER observaciones'
  );
  if (await columnExists(connection, 'recetas', 'estado')) {
    await connection.query(`
      UPDATE recetas receta
      INNER JOIN estados_receta estado ON estado.nombre = receta.estado
      SET receta.estado_receta_id = estado.estado_receta_id
      WHERE receta.estado_receta_id IS NULL
    `);
  }
  const [[missingStatuses]] = await connection.query(`
    SELECT COUNT(*) AS total
    FROM recetas
    WHERE estado_receta_id IS NULL
  `);
  if (Number(missingStatuses.total) > 0) {
    throw new Error('Hay recetas sin estado válido.');
  }
  await connection.query(`
    ALTER TABLE recetas
      MODIFY estado_receta_id INT UNSIGNED NOT NULL
  `);
  await addForeignKey(
    connection,
    'recetas',
    'fk_recetas_estado',
    `FOREIGN KEY (estado_receta_id)
     REFERENCES estados_receta(estado_receta_id)
     ON DELETE RESTRICT ON UPDATE CASCADE`
  );
  await dropColumn(connection, 'recetas', 'estado');
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    if (!(await columnExists(
      connection,
      'vacunaciones',
      'vacunacion_id'
    ))) {
      console.log(
        'Personas clínicas y fechas ya corresponden al esquema normalizado final.'
      );
      return;
    }

    console.log('Normalizando profesionales veterinarios...');
    await normalizeVeterinarians(connection);

    console.log('Convirtiendo edades a fechas de nacimiento...');
    await normalizeBirthDates(connection);

    console.log('Normalizando catálogos de recetas...');
    await normalizePrescriptionCatalogs(connection);

    console.log('Personas clínicas, edades y recetas normalizadas correctamente.');
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
