-- Migración aditiva para revisión. No se ejecuta al iniciar el servidor.
-- No convierte ni actualiza citas, historiales, pagos o ventas existentes.
CREATE TABLE IF NOT EXISTS grooming_transporte_ruta (
  ruta_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tutor_id BIGINT UNSIGNED NOT NULL,
  tipo_grooming_id INT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  direccion_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  costo DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_grooming_ruta (fecha, hora, tutor_id, tipo_grooming_id, direccion_key),
  CONSTRAINT fk_grooming_ruta_tutor FOREIGN KEY (tutor_id) REFERENCES tutor(tutor_id),
  CONSTRAINT fk_grooming_ruta_tipo FOREIGN KEY (tipo_grooming_id) REFERENCES tipo_grooming(tipo_grooming_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grooming_operacion (
  grooming_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  forma_pago_id INT UNSIGNED NULL,
  ruta_id BIGINT UNSIGNED NULL,
  KEY idx_grooming_operacion_ruta (ruta_id),
  CONSTRAINT fk_grooming_operacion_cita FOREIGN KEY (grooming_id) REFERENCES cita_grooming(grooming_id) ON DELETE CASCADE,
  CONSTRAINT fk_grooming_operacion_pago FOREIGN KEY (forma_pago_id) REFERENCES forma_pago(forma_pago_id),
  CONSTRAINT fk_grooming_operacion_ruta FOREIGN KEY (ruta_id) REFERENCES grooming_transporte_ruta(ruta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
