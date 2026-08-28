const pool = require('../config/db');

const TABLES_REPLACED_BY_CODE = [
  'password_reset_tokens',
  'notificaciones_descartadas',
  'reportes_ia',
];

const run = async () => {
  const connection = await pool.getConnection();

  try {
    const placeholders = TABLES_REPLACED_BY_CODE.map(() => '?').join(', ');
    const [existingTables] = await connection.query(
      `
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
      `,
      TABLES_REPLACED_BY_CODE
    );

    const existingNames = new Set(
      existingTables.map((table) => table.tableName)
    );

    for (const table of TABLES_REPLACED_BY_CODE) {
      if (!existingNames.has(table)) {
        console.log(`La tabla ${table} ya no existe.`);
        continue;
      }

      const [[countRow]] = await connection.query(
        `SELECT COUNT(*) AS total FROM \`${table}\``
      );

      if (Number(countRow.total) > 0) {
        throw new Error(
          `No se eliminó ${table}: contiene ${countRow.total} registro(s).`
        );
      }

      await connection.query(`DROP TABLE \`${table}\``);
      console.log(`Tabla eliminada: ${table}`);
    }
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Error al retirar tablas reemplazadas por código:', error);
  process.exit(1);
});
