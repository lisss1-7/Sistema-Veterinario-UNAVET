const pool = require('../config/db');

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

const indexExists = async (connection, table, index) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    console.log('Reparando componentes obligatorios de nombres...');
    await connection.query(`
      UPDATE usuarios
      SET
        primer_nombre = CASE
          WHEN primer_nombre IS NULL
            OR TRIM(primer_nombre) = ''
            OR primer_nombre REGEXP '^[0-9]+$'
            THEN 'Usuario'
          ELSE TRIM(primer_nombre)
        END,
        primer_apellido = CASE
          WHEN primer_apellido IS NULL
            OR TRIM(primer_apellido) = ''
            OR primer_apellido REGEXP '^[0-9]+$'
            THEN 'Sin apellido'
          ELSE TRIM(primer_apellido)
        END
    `);
    await connection.query(`
      UPDATE tutores
      SET
        primer_nombre = CASE
          WHEN primer_nombre IS NULL
            OR TRIM(primer_nombre) = ''
            OR primer_nombre REGEXP '^[0-9]+$'
            THEN 'Tutor'
          ELSE TRIM(primer_nombre)
        END,
        primer_apellido = CASE
          WHEN primer_apellido IS NULL
            OR TRIM(primer_apellido) = ''
            OR primer_apellido REGEXP '^[0-9]+$'
            THEN 'Sin apellido'
          ELSE TRIM(primer_apellido)
        END
    `);
    await connection.query(`
      ALTER TABLE usuarios
      MODIFY primer_nombre VARCHAR(80) NOT NULL,
      MODIFY primer_apellido VARCHAR(80) NOT NULL
    `);
    await connection.query(`
      ALTER TABLE tutores
      MODIFY primer_nombre VARCHAR(80) NOT NULL,
      MODIFY primer_apellido VARCHAR(80) NOT NULL
    `);
    await connection.query(`
      UPDATE historial_clinico
      SET estado_clinico = 'Pendiente'
      WHERE cita_id IS NOT NULL
        AND veterinario_id IS NULL
        AND diagnostico = 'Pendiente de evaluación médica.'
        AND tratamiento = 'Pendiente de indicación médica.'
    `);
    await connection.query(`
      INSERT INTO tamanos_animales (nombre)
      VALUES ('No especificado')
      ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
    `);
    await connection.query(`
      UPDATE citas_grooming
      SET tamano_animal_id = (
        SELECT tamano_animal_id
        FROM tamanos_animales
        WHERE nombre = 'No especificado'
        LIMIT 1
      )
      WHERE tamano_animal_id IS NULL
    `);
    if (await constraintExists(
      connection,
      'fk_citas_grooming_tamano_animal'
    )) {
      await connection.query(`
        ALTER TABLE citas_grooming
        DROP FOREIGN KEY fk_citas_grooming_tamano_animal
      `);
    }
    await connection.query(`
      ALTER TABLE citas_grooming
      MODIFY tamano_animal_id INT NOT NULL
    `);
    await connection.query(`
      ALTER TABLE citas_grooming
      ADD CONSTRAINT fk_citas_grooming_tamano_animal
        FOREIGN KEY (tamano_animal_id)
        REFERENCES tamanos_animales (tamano_animal_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    console.log('Normalizando especialidades profesionales...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS especialidades (
        especialidad_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(120) NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (especialidad_id),
        UNIQUE KEY uq_especialidad_nombre (nombre),
        CONSTRAINT chk_especialidad_activa CHECK (activo IN (0, 1))
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Catálogo de especialidades profesionales del personal.'
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuario_especialidades (
        usuario_id BIGINT UNSIGNED NOT NULL,
        especialidad_id INT UNSIGNED NOT NULL,
        es_principal TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (usuario_id, especialidad_id),
        KEY idx_usuario_especialidad_especialidad (especialidad_id),
        CONSTRAINT fk_usuario_especialidad_usuario
          FOREIGN KEY (usuario_id)
          REFERENCES usuarios (usuario_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_usuario_especialidad_catalogo
          FOREIGN KEY (especialidad_id)
          REFERENCES especialidades (especialidad_id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_usuario_especialidad_principal CHECK (
          es_principal IN (0, 1)
        )
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Relación de usuarios con una o más especialidades.'
    `);

    if (await columnExists(connection, 'usuarios', 'especialidad')) {
      await connection.query(`
        INSERT INTO especialidades (nombre, activo)
        SELECT DISTINCT TRIM(especialidad), 1
        FROM usuarios
        WHERE especialidad IS NOT NULL
          AND TRIM(especialidad) <> ''
        ON DUPLICATE KEY UPDATE activo = 1
      `);
      await connection.query(`
        INSERT IGNORE INTO usuario_especialidades (
          usuario_id,
          especialidad_id,
          es_principal
        )
        SELECT
          usuario.usuario_id,
          especialidad.especialidad_id,
          1
        FROM usuarios usuario
        INNER JOIN especialidades especialidad
          ON especialidad.nombre = TRIM(usuario.especialidad)
        WHERE usuario.especialidad IS NOT NULL
          AND TRIM(usuario.especialidad) <> ''
      `);
      await connection.query(`
        ALTER TABLE usuarios DROP COLUMN especialidad
      `);
    }

    console.log('Asegurando que cada raza corresponda a su especie...');
    if (!(await indexExists(
      connection,
      'razas',
      'uq_razas_id_especie'
    ))) {
      await connection.query(`
        ALTER TABLE razas
        ADD UNIQUE KEY uq_razas_id_especie (raza_id, especie_id)
      `);
    }
    if (await constraintExists(connection, 'fk_pacientes_razas')) {
      await connection.query(`
        ALTER TABLE pacientes
        DROP FOREIGN KEY fk_pacientes_razas
      `);
    }
    if (!(await constraintExists(
      connection,
      'fk_paciente_raza_especie'
    ))) {
      await connection.query(`
        ALTER TABLE pacientes
        ADD CONSTRAINT fk_paciente_raza_especie
          FOREIGN KEY (raza_id, especie_id)
          REFERENCES razas (raza_id, especie_id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    console.log('Integridad restante normalizada correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Falló la normalización de integridad restante:', error);
  process.exitCode = 1;
});
