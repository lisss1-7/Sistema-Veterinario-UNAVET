const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();
  try {
    const [columns] = await connection.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      ['receta', 'motivo_consulta']
    );
    if (columns.length === 0) {
      await connection.query(`ALTER TABLE receta
        ADD COLUMN motivo_consulta TEXT NULL
        COMMENT 'Motivo de consulta asociado a la receta médica.'`);
    }
    console.log('Motivo de consulta de recetas configurado correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar el motivo de consulta:', error.code || error.message);
  process.exitCode = 1;
});
