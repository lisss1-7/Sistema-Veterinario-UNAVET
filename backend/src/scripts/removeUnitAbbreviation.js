const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();

  try {
    const [columns] = await connection.query(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'unidades_medida'
         AND COLUMN_NAME = 'abreviatura'
       LIMIT 1`
    );

    if (columns.length === 0) {
      console.log('La columna unidades_medida.abreviatura ya no existe.');
      return;
    }

    await connection.query(
      'ALTER TABLE unidades_medida DROP COLUMN abreviatura'
    );
    console.log('Columna unidades_medida.abreviatura eliminada correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No se pudo eliminar unidades_medida.abreviatura:', error);
  process.exitCode = 1;
});
