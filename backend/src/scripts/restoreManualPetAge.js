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

const parseDate = (value) => {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
};

const monthDifference = (from, to) => {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return 0;
  return Math.max(
    0,
    (end.year - start.year) * 12 +
      end.month -
      start.month -
      (end.day < start.day ? 1 : 0)
  );
};

const formatAge = (totalMonths) => {
  const monthsValue = Math.max(0, Number(totalMonths) || 0);
  const years = Math.floor(monthsValue / 12);
  const months = monthsValue % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months > 0 || years === 0) {
    parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  }
  return parts.join(' ');
};

const getToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const migrateTable = async (
  connection,
  { table, idColumn, fallbackReference }
) => {
  if (!(await columnExists(connection, table, 'edad'))) {
    await connection.query(
      `ALTER TABLE ${table} ADD COLUMN edad VARCHAR(50) NULL`
    );
  }

  if (await columnExists(connection, table, 'fecha_nacimiento')) {
    const [rows] = await connection.query(
      `
      SELECT
        ${idColumn} AS id,
        edad,
        DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
        edad_estimada_meses,
        DATE_FORMAT(
          COALESCE(fecha_estimacion_edad, ${fallbackReference}),
          '%Y-%m-%d'
        ) AS fecha_referencia
      FROM ${table}
      `
    );
    const today = getToday();
    for (const row of rows) {
      if (String(row.edad || '').trim()) continue;
      let totalMonths = null;
      if (row.fecha_nacimiento) {
        totalMonths = monthDifference(row.fecha_nacimiento, today);
      } else if (row.edad_estimada_meses !== null) {
        totalMonths =
          Number(row.edad_estimada_meses) +
          monthDifference(row.fecha_referencia, today);
      }
      await connection.query(
        `UPDATE ${table} SET edad = ? WHERE ${idColumn} = ?`,
        [
          totalMonths === null ? 'No especificada' : formatAge(totalMonths),
          row.id,
        ]
      );
    }
  }

  await connection.query(
    `UPDATE ${table} SET edad = 'No especificada'
     WHERE edad IS NULL OR TRIM(edad) = ''`
  );
  await connection.query(
    `ALTER TABLE ${table} MODIFY edad VARCHAR(50) NOT NULL`
  );

  for (const column of [
    'fecha_estimacion_edad',
    'edad_estimada_meses',
    'fecha_nacimiento_aproximada',
    'fecha_nacimiento',
  ]) {
    if (await columnExists(connection, table, column)) {
      await connection.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
  }
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    await migrateTable(connection, {
      table: 'pacientes',
      idColumn: 'paciente_id',
      fallbackReference: 'fecha_registro',
    });
    await migrateTable(connection, {
      table: 'citas_grooming',
      idColumn: 'grooming_id',
      fallbackReference: 'LEAST(fecha, CURDATE())',
    });
    console.log('Edad manual restaurada correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
