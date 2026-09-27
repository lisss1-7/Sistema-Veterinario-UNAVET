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

const run = async () => {
  const connection = await pool.getConnection();

  try {
    if (!(await columnExists(connection, 'usuario', 'eliminado_en'))) {
      await connection.query(`
        ALTER TABLE usuario
        ADD COLUMN eliminado_en DATETIME NULL
          COMMENT 'Fecha y hora del borrado lógico del usuario.'
          AFTER actualizado_en
      `);
    }

    if (!(await indexExists(
      connection,
      'usuario',
      'idx_usuarios_eliminado_en'
    ))) {
      await connection.query(`
        ALTER TABLE usuario
        ADD INDEX idx_usuarios_eliminado_en (eliminado_en)
      `);
    }

    console.log('Borrado lógico de usuarios configurado correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar el borrado lógico de usuarios:', error);
  process.exitCode = 1;
});
