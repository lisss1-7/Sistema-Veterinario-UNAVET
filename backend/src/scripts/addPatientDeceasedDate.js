const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();
  try {
    const [columns] = await connection.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      ['paciente', 'fallecido_en']
    );
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE paciente
        ADD COLUMN fallecido_en DATETIME NULL
          COMMENT 'Fecha y hora en que se registró el fallecimiento de la mascota.'
          AFTER activo
      `);
    }
    console.log('Estado de fallecimiento de pacientes configurado correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar el estado de fallecimiento:', error);
  process.exitCode = 1;
});
