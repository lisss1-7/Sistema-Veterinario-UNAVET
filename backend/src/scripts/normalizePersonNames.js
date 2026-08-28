const fs = require('fs');
const path = require('path');
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

const splitLegacyName = (value) => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return {
      firstName: 'No registrado',
      middleName: null,
      firstSurname: null,
      secondSurname: null,
    };
  }
  if (words.length === 1) {
    return {
      firstName: words[0],
      middleName: null,
      firstSurname: null,
      secondSurname: null,
    };
  }
  if (words.length === 2) {
    return {
      firstName: words[0],
      middleName: null,
      firstSurname: words[1],
      secondSurname: null,
    };
  }
  if (words.length === 3) {
    return {
      firstName: words[0],
      middleName: null,
      firstSurname: words[1],
      secondSurname: words[2],
    };
  }
  return {
    firstName: words[0],
    middleName: words.slice(1, -2).join(' '),
    firstSurname: words[words.length - 2],
    secondSurname: words[words.length - 1],
  };
};

const addNameColumns = async (connection, table) => {
  const columns = [
    ['primer_nombre', "VARCHAR(80) NULL COMMENT 'Primer nombre de la persona.'"],
    ['segundo_nombre', "VARCHAR(80) NULL COMMENT 'Segundo nombre u otros nombres de la persona.'"],
    ['primer_apellido', "VARCHAR(80) NULL COMMENT 'Primer apellido de la persona.'"],
    ['segundo_apellido', "VARCHAR(80) NULL COMMENT 'Segundo apellido de la persona.'"],
  ];

  for (const [column, definition] of columns) {
    if (!(await columnExists(connection, table, column))) {
      await connection.query(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      );
    }
  }
};

const migrateTable = async (connection, table, idColumn) => {
  await addNameColumns(connection, table);

  if (await columnExists(connection, table, 'nombre')) {
    const [rows] = await connection.query(
      `SELECT ${idColumn}, nombre, primer_nombre
         FROM ${table}`
    );

    for (const row of rows) {
      if (row.primer_nombre) continue;
      const parts = splitLegacyName(row.nombre);
      await connection.query(
        `UPDATE ${table}
            SET primer_nombre = ?,
                segundo_nombre = ?,
                primer_apellido = ?,
                segundo_apellido = ?
          WHERE ${idColumn} = ?`,
        [
          parts.firstName,
          parts.middleName,
          parts.firstSurname,
          parts.secondSurname,
          row[idColumn],
        ]
      );
    }
  }

  await connection.query(
    `ALTER TABLE ${table}
       MODIFY primer_nombre VARCHAR(80) NOT NULL
         COMMENT 'Primer nombre de la persona.'`
  );

  const legacyIndex = table === 'tutores'
    ? 'idx_tutores_nombre'
    : 'idx_usuarios_nombre';
  if (await indexExists(connection, table, legacyIndex)) {
    await connection.query(`ALTER TABLE ${table} DROP INDEX ${legacyIndex}`);
  }

  const normalizedIndex = `idx_${table}_apellidos_nombres`;
  if (!(await indexExists(connection, table, normalizedIndex))) {
    await connection.query(
      `ALTER TABLE ${table}
       ADD INDEX ${normalizedIndex}
         (primer_apellido, segundo_apellido, primer_nombre, segundo_nombre)`
    );
  }

  if (await columnExists(connection, table, 'nombre')) {
    await connection.query(`ALTER TABLE ${table} DROP COLUMN nombre`);
  }
};

const run = async () => {
  const connection = await pool.getConnection();

  try {
    const [tutores] = await connection.query('SELECT * FROM tutores');
    const [usuarios] = await connection.query('SELECT * FROM usuarios');
    const backupDir = path.join(__dirname, '../../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      backupDir,
      `before-person-name-normalization-${timestamp}.json`
    );
    fs.writeFileSync(
      backupPath,
      JSON.stringify({ createdAt: new Date().toISOString(), tutores, usuarios }, null, 2),
      'utf8'
    );
    console.log(`Respaldo creado: ${backupPath}`);

    await migrateTable(connection, 'tutores', 'tutor_id');
    await migrateTable(connection, 'usuarios', 'usuario_id');
    console.log('Nombres de tutores y usuarios normalizados correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Error al normalizar nombres:', error);
  process.exit(1);
});
