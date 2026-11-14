-- Migración aditiva para revisión; nunca se ejecuta al iniciar el servidor.
-- No altera ni rellena recetas, pacientes, historiales, inventario o ventas.
CREATE TABLE IF NOT EXISTS receta_consulta (
  receta_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  peso_kg DECIMAL(10,6) NULL,
  procedimientos JSON NOT NULL,
  CONSTRAINT fk_receta_consulta_receta FOREIGN KEY (receta_id) REFERENCES receta(receta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
