const pool = require('../config/db');

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const indexExists = async (connection, tableName, indexName) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
};

const run = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoria_inventario (
        auditoria_inventario_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        codigo VARCHAR(40) NULL,
        usuario_id BIGINT UNSIGNED NULL,
        fecha_auditoria DATE NOT NULL,
        iniciado_en DATETIME NOT NULL,
        finalizado_en DATETIME NOT NULL,
        total_productos INT UNSIGNED NOT NULL DEFAULT 0,
        productos_con_diferencia INT UNSIGNED NOT NULL DEFAULT 0,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (auditoria_inventario_id),
        UNIQUE KEY uq_auditoria_inventario_codigo (codigo),
        KEY idx_auditoria_inventario_usuario (usuario_id),
        KEY idx_auditoria_inventario_fecha (finalizado_en),
        KEY idx_auditoria_inventario_periodo (fecha_auditoria),
        CONSTRAINT fk_auditoria_inventario_usuario
          FOREIGN KEY (usuario_id)
          REFERENCES usuario (usuario_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,
        CONSTRAINT chk_auditoria_inventario_totales
          CHECK (
            total_productos >= 0
            AND productos_con_diferencia >= 0
            AND productos_con_diferencia <= total_productos
          )
      ) ENGINE=InnoDB
        COMMENT='Encabezado de los conteos físicos finalizados del inventario.'
    `);

    if (
      !(await columnExists(
        connection,
        'auditoria_inventario',
        'fecha_auditoria'
      ))
    ) {
      await connection.query(`
        ALTER TABLE auditoria_inventario
        ADD COLUMN fecha_auditoria DATE NULL AFTER usuario_id
      `);
      await connection.query(`
        UPDATE auditoria_inventario
        SET fecha_auditoria = DATE(iniciado_en)
        WHERE fecha_auditoria IS NULL
      `);
      await connection.query(`
        ALTER TABLE auditoria_inventario
        MODIFY COLUMN fecha_auditoria DATE NOT NULL
      `);
    }

    if (
      !(await indexExists(
        connection,
        'auditoria_inventario',
        'idx_auditoria_inventario_periodo'
      ))
    ) {
      await connection.query(`
        ALTER TABLE auditoria_inventario
        ADD KEY idx_auditoria_inventario_periodo (fecha_auditoria)
      `);
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoria_inventario_detalle (
        auditoria_inventario_detalle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        auditoria_inventario_id BIGINT UNSIGNED NOT NULL,
        producto_id BIGINT UNSIGNED NOT NULL,
        producto_nombre VARCHAR(180) NOT NULL,
        categoria_nombre VARCHAR(120) NOT NULL,
        unidad_medida VARCHAR(100) NOT NULL,
        stock_sistema INT UNSIGNED NOT NULL,
        conteo_fisico INT UNSIGNED NOT NULL,
        diferencia INT NOT NULL,
        notas VARCHAR(500) NULL,
        PRIMARY KEY (auditoria_inventario_detalle_id),
        UNIQUE KEY uq_auditoria_inventario_producto (
          auditoria_inventario_id,
          producto_id
        ),
        KEY idx_auditoria_inventario_detalle_producto (producto_id),
        CONSTRAINT fk_auditoria_inventario_detalle_encabezado
          FOREIGN KEY (auditoria_inventario_id)
          REFERENCES auditoria_inventario (auditoria_inventario_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_auditoria_inventario_detalle_producto
          FOREIGN KEY (producto_id)
          REFERENCES producto_inventario (producto_id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_auditoria_inventario_detalle_stock
          CHECK (stock_sistema >= 0 AND conteo_fisico >= 0)
      ) ENGINE=InnoDB
        COMMENT='Resultados por producto de cada auditoría física de inventario.'
    `);

    console.log('Auditorías de inventario configuradas correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible configurar las auditorías de inventario:', error);
  process.exitCode = 1;
});
