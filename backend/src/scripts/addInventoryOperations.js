const pool = require('../config/db');

const migrate = async (connection) => {
  await connection.query(`CREATE TABLE IF NOT EXISTS compra_inventario (
    compra_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    proveedor_id BIGINT UNSIGNED NOT NULL,
    proveedor_nombre VARCHAR(150) NOT NULL,
    fecha DATE NOT NULL,
    comprobante VARCHAR(100) NULL,
    observaciones VARCHAR(500) NULL,
    usuario_id BIGINT UNSIGNED NULL,
    clave_envio VARCHAR(64) NOT NULL,
    contenido_hash CHAR(64) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    anulada TINYINT(1) NOT NULL DEFAULT 0,
    motivo_anulacion VARCHAR(255) NULL,
    anulada_por BIGINT UNSIGNED NULL,
    anulada_en DATETIME NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_compra_clave_envio (clave_envio),
    KEY idx_compra_fecha (fecha, compra_id),
    CONSTRAINT fk_compra_proveedor FOREIGN KEY (proveedor_id)
      REFERENCES proveedor(proveedor_id) ON DELETE RESTRICT,
    CONSTRAINT fk_compra_usuario FOREIGN KEY (usuario_id)
      REFERENCES usuario(usuario_id) ON DELETE SET NULL,
    CONSTRAINT fk_compra_anulada_por FOREIGN KEY (anulada_por)
      REFERENCES usuario(usuario_id) ON DELETE SET NULL,
    CONSTRAINT chk_compra_total CHECK (total >= 0)
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS compra_inventario_detalle (
    detalle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    compra_id BIGINT UNSIGNED NOT NULL,
    producto_id BIGINT UNSIGNED NOT NULL,
    producto_nombre VARCHAR(180) NOT NULL,
    producto_lote_id BIGINT UNSIGNED NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    costo_unitario DECIMAL(10,2) NOT NULL,
    UNIQUE KEY uq_compra_lote (producto_lote_id),
    CONSTRAINT fk_compra_detalle_compra FOREIGN KEY (compra_id)
      REFERENCES compra_inventario(compra_id) ON DELETE RESTRICT,
    CONSTRAINT fk_compra_detalle_producto FOREIGN KEY (producto_id)
      REFERENCES producto_inventario(producto_id) ON DELETE RESTRICT,
    CONSTRAINT fk_compra_detalle_lote FOREIGN KEY (producto_lote_id)
      REFERENCES lote_producto(producto_lote_id) ON DELETE RESTRICT,
    CONSTRAINT chk_compra_detalle CHECK (cantidad > 0 AND costo_unitario >= 0)
  ) ENGINE=InnoDB`);
  for (const [column, definition] of [
    ['anulada', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['motivo_anulacion', 'VARCHAR(255) NULL'],
    ['anulada_por', 'BIGINT UNSIGNED NULL'],
    ['anulada_en', 'DATETIME NULL'],
  ]) {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cierre_venta' AND COLUMN_NAME = ?`,
      [column]
    );
    if (!rows.length) await connection.query(`ALTER TABLE cierre_venta ADD COLUMN ${column} ${definition}`);
  }
};

const run = async () => {
  // This migration is intentionally restricted to the agreed local installation.
  if (!['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST).toLowerCase())) {
    throw new Error('Esta migración debe ejecutarse únicamente en MySQL local');
  }
  const connection = await pool.getConnection();
  try {
    await migrate(connection);
    console.log('Compras de inventario y anulaciones configuradas. Se conservaron los datos existentes.');
  } finally {
    connection.release();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error('No se pudo configurar el inventario:', error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = { migrate };
