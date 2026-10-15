const pool = require('../config/db');
(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS cierre_venta_turno (
    turno_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    fecha DATE NOT NULL,
    numero INT UNSIGNED NOT NULL,
    nombre VARCHAR(80) NULL,
    desde_venta_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    hasta_venta_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    finalizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_por BIGINT UNSIGNED NULL,
    resumen JSON NOT NULL,
    PRIMARY KEY (turno_id),
    UNIQUE KEY uq_cierre_venta_turno_fecha_numero (fecha, numero),
    KEY idx_cierre_venta_turno_usuario (finalizado_por),
    CONSTRAINT fk_cierre_venta_turno_usuario FOREIGN KEY (finalizado_por)
      REFERENCES usuario(usuario_id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB COMMENT='Resúmenes de turnos consecutivos del cierre de ventas.'`);
  console.log('Cierres de turno configurados correctamente.');
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => pool.end());
