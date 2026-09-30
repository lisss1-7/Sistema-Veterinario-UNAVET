const pool = require('../config/db');

const DEFAULT_OPTIONS = [
  'Concentrado',
  'Pollo cocido',
  'Verduras',
  'Sobres de comida',
  'Alimento en lata',
  'Comida casera',
  'Pescado cocido',
  'Arroz cocido',
];

const run = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS opcion_alimentacion (
        opcion_alimentacion_id INT NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(80) NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (opcion_alimentacion_id),
        UNIQUE KEY uq_opcion_alimentacion_nombre (nombre)
      ) ENGINE=InnoDB
        COMMENT='Opciones de alimentación para pacientes.'
    `);

    for (const name of DEFAULT_OPTIONS) {
      await connection.query(
        'INSERT IGNORE INTO opcion_alimentacion (nombre) VALUES (?)',
        [name]
      );
    }

    console.log('Opciones de alimentación configuradas correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar las opciones de alimentación:', error);
  process.exitCode = 1;
});
