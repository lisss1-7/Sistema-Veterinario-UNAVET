const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cierre_venta_dia (
        fecha DATE NOT NULL
          COMMENT 'Fecha contable a la que corresponde el cierre diario.',
        finalizado TINYINT(1) NOT NULL DEFAULT 0
          COMMENT 'Indica si el día fue finalizado y ya no admite cambios.',
        finalizado_en DATETIME NULL
          COMMENT 'Fecha y hora en que se finalizó el día.',
        finalizado_por BIGINT UNSIGNED NULL
          COMMENT 'Usuario que finalizó el día.',
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          COMMENT 'Fecha y hora de creación del registro.',
        PRIMARY KEY (fecha),
        KEY idx_cierre_venta_dia_finalizado_por (finalizado_por),
        CONSTRAINT fk_cierre_venta_dia_usuario
          FOREIGN KEY (finalizado_por)
          REFERENCES usuario (usuario_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      ) ENGINE=InnoDB
        COMMENT='Estado de finalización de cada día del cierre de ventas.'
    `);

    console.log('Cierre diario de ventas configurado correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar el cierre diario de ventas:', error);
  process.exitCode = 1;
});
