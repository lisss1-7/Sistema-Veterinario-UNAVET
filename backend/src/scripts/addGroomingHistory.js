const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();
  try {
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico'
         AND COLUMN_NAME IN ('grooming_id', 'origen')`
    );
    if (!columns.some((column) => column.COLUMN_NAME === 'grooming_id')) {
      await connection.query(
        `ALTER TABLE historial_clinico
         ADD COLUMN grooming_id BIGINT UNSIGNED NULL AFTER cita_id,
         ADD UNIQUE KEY uq_historial_grooming (grooming_id),
         ADD CONSTRAINT fk_historial_grooming FOREIGN KEY (grooming_id)
           REFERENCES cita_grooming(grooming_id) ON DELETE SET NULL ON UPDATE CASCADE`
      );
    }
    const origin = columns.find((column) => column.COLUMN_NAME === 'origen');
    if (origin?.COLUMN_TYPE === "enum('Manual','Cita clínica')") {
      await connection.query(
        `ALTER TABLE historial_clinico
         MODIFY COLUMN origen ENUM('Manual', 'Cita clínica', 'Grooming') NOT NULL DEFAULT 'Manual'`
      );
    } else if (!origin?.COLUMN_TYPE.includes("'Grooming'")) {
      throw new Error('El catálogo de origen del historial requiere revisión');
    }
    await connection.query(
      `INSERT INTO tipo_consulta (nombre)
       SELECT 'Grooming programado' WHERE NOT EXISTS
         (SELECT 1 FROM tipo_consulta WHERE nombre = 'Grooming programado')`
    );
    console.log('Vinculación del historial de grooming configurada correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar el historial de grooming:', error.message);
  process.exitCode = 1;
});
