const pool = require('../config/db');

const columnExists = async (connection, table, column) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [table, column]
  );
  return rows.length > 0;
};

const indexExists = async (connection, table, index) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
    [table, index]
  );
  return rows.length > 0;
};

const constraintExists = async (connection, constraint) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
    [constraint]
  );
  return rows.length > 0;
};

const normalizePayments = async (connection) => {
  const paymentColumns = [
    'transferencia_bi',
    'transferencia_ba',
    'tarjeta_bac',
    'tarjeta_bi',
    'efectivo',
  ];

  for (const code of paymentColumns) {
    if (!(await columnExists(connection, 'cierres_ventas', code))) continue;

    await connection.query(
      `
      INSERT INTO venta_pagos (venta_id, forma_pago_id, monto)
      SELECT venta.venta_id, forma.forma_pago_id, venta.${code}
      FROM cierres_ventas venta
      INNER JOIN formas_pago forma ON forma.codigo = ?
      WHERE venta.${code} > 0
      ON DUPLICATE KEY UPDATE
        monto = CASE
          WHEN venta_pagos.monto = 0 THEN VALUES(monto)
          ELSE venta_pagos.monto
        END
      `,
      [code]
    );
  }

  const [invalidSales] = await connection.query(`
    SELECT
      venta.venta_id,
      COALESCE(detalle.total, 0) AS total_detalle,
      COALESCE(pago.total, 0) AS total_pago
    FROM cierres_ventas venta
    LEFT JOIN (
      SELECT venta_id, SUM(cantidad * precio_unitario) AS total
      FROM cierre_ventas_detalle
      GROUP BY venta_id
    ) detalle ON detalle.venta_id = venta.venta_id
    LEFT JOIN (
      SELECT venta_id, SUM(monto) AS total
      FROM venta_pagos
      GROUP BY venta_id
    ) pago ON pago.venta_id = venta.venta_id
    WHERE ABS(COALESCE(detalle.total, 0) - COALESCE(pago.total, 0)) > 0.009
  `);

  if (invalidSales.length > 0) {
    throw new Error(
      `No se retiraron los campos de pago antiguos porque ${invalidSales.length} venta(s) no cuadran con sus pagos.`
    );
  }

  for (const column of paymentColumns) {
    if (await columnExists(connection, 'cierres_ventas', column)) {
      await connection.query(`ALTER TABLE cierres_ventas DROP COLUMN ${column}`);
    }
  }
};

const normalizeSchedules = async (connection) => {
  await connection.query(`
    DELETE duplicate
    FROM horarios_atencion duplicate
    INNER JOIN horarios_atencion keeper
      ON duplicate.modulo_id = keeper.modulo_id
     AND duplicate.tipo_grooming_id <=> keeper.tipo_grooming_id
     AND duplicate.dia_semana = keeper.dia_semana
     AND duplicate.horario_id > keeper.horario_id
  `);

  if (
    !(await columnExists(
      connection,
      'horarios_atencion',
      'tipo_grooming_clave'
    ))
  ) {
    await connection.query('DROP TABLE IF EXISTS horarios_atencion_nueva');
    await connection.query(`
      CREATE TABLE horarios_atencion_nueva (
        horario_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        modulo_id INT UNSIGNED NOT NULL,
        tipo_grooming_id INT NULL,
        tipo_grooming_clave INT
          GENERATED ALWAYS AS (IFNULL(tipo_grooming_id, 0)) STORED,
        dia_semana TINYINT UNSIGNED NOT NULL,
        hora_inicio TIME NOT NULL,
        hora_fin TIME NOT NULL,
        intervalo_minutos SMALLINT UNSIGNED NOT NULL,
        capacidad_diaria SMALLINT UNSIGNED NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (horario_id),
        UNIQUE KEY uq_horario_modulo_tipo_dia_normalizado
          (modulo_id, tipo_grooming_clave, dia_semana),
        KEY idx_horarios_tipo_grooming (tipo_grooming_id),
        CONSTRAINT fk_horarios_v2_modulo
          FOREIGN KEY (modulo_id) REFERENCES modulos_sistema(modulo_id)
          ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_horarios_v2_tipo_grooming
          FOREIGN KEY (tipo_grooming_id) REFERENCES tipos_grooming(tipo_grooming_id)
          ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_horarios_dia_semana
          CHECK (dia_semana BETWEEN 0 AND 6),
        CONSTRAINT chk_horarios_intervalo
          CHECK (intervalo_minutos > 0 AND hora_inicio < hora_fin)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      INSERT INTO horarios_atencion_nueva (
        horario_id,
        modulo_id,
        tipo_grooming_id,
        dia_semana,
        hora_inicio,
        hora_fin,
        intervalo_minutos,
        capacidad_diaria,
        activo
      )
      SELECT
        horario_id,
        modulo_id,
        tipo_grooming_id,
        dia_semana,
        hora_inicio,
        hora_fin,
        intervalo_minutos,
        capacidad_diaria,
        activo
      FROM horarios_atencion
    `);

    const [[counts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM horarios_atencion) AS anteriores,
        (SELECT COUNT(*) FROM horarios_atencion_nueva) AS nuevos
    `);
    if (Number(counts.anteriores) !== Number(counts.nuevos)) {
      throw new Error('La copia normalizada de horarios no conserva todos los registros.');
    }

    await connection.query(`
      RENAME TABLE
        horarios_atencion TO horarios_atencion_anterior,
        horarios_atencion_nueva TO horarios_atencion
    `);
    await connection.query('DROP TABLE horarios_atencion_anterior');
  }
};

const normalizeAppointmentHistory = async (connection) => {
  await connection.query(`
    INSERT INTO tipos_consulta (nombre)
    SELECT 'Cita clínica programada'
    WHERE NOT EXISTS (
      SELECT 1
      FROM tipos_consulta
      WHERE LOWER(TRIM(nombre)) = LOWER('Cita clínica programada')
    )
  `);
  await connection.query(`
    INSERT INTO tipos_consulta (nombre)
    SELECT 'Rutinaria'
    WHERE NOT EXISTS (
      SELECT 1
      FROM tipos_consulta
      WHERE LOWER(TRIM(nombre)) = LOWER('Rutinaria')
    )
  `);
  await connection.query(`
    UPDATE historial_clinico historial
    INNER JOIN tipos_consulta tipo
      ON LOWER(TRIM(tipo.nombre)) = LOWER(TRIM(historial.tipo_consulta))
    SET historial.tipo_consulta_id = tipo.tipo_consulta_id
    WHERE historial.tipo_consulta_id IS NULL
  `);

  const [duplicateGroups] = await connection.query(`
    SELECT cita_id
    FROM historial_clinico
    WHERE cita_id IS NOT NULL
    GROUP BY cita_id
    HAVING COUNT(*) > 1
  `);

  for (const group of duplicateGroups) {
    const [records] = await connection.query(
      `
      SELECT historial_id, origen, estado_clinico
      FROM historial_clinico
      WHERE cita_id = ?
      ORDER BY
        CASE WHEN estado_clinico = 'Completado' THEN 0 ELSE 1 END,
        historial_id
      `,
      [group.cita_id]
    );
    const keeper = records[0];
    const removable = records.slice(1);
    const unsafe = removable.filter(
      (record) =>
        record.origen !== 'Cita clínica' ||
        record.estado_clinico !== 'Pendiente'
    );

    if (unsafe.length > 0) {
      throw new Error(
        `La cita ${group.cita_id} tiene historiales clínicos duplicados con información que requiere revisión manual.`
      );
    }

    if (removable.length > 0) {
      await connection.query(
        `
        DELETE FROM historial_clinico
        WHERE historial_id IN (?)
          AND historial_id <> ?
          AND origen = 'Cita clínica'
          AND estado_clinico = 'Pendiente'
        `,
        [removable.map((record) => record.historial_id), keeper.historial_id]
      );
    }
  }

  if (
    !(await indexExists(connection, 'historial_clinico', 'uq_historial_cita'))
  ) {
    await connection.query(`
      ALTER TABLE historial_clinico
      ADD UNIQUE KEY uq_historial_cita (cita_id)
    `);
  }
};

const run = async () => {
  const connection = await pool.getConnection();

  try {
    console.log('Normalizando pagos...');
    await normalizePayments(connection);

    console.log('Corrigiendo unicidad de horarios...');
    await normalizeSchedules(connection);

    console.log('Protegiendo la relación cita-historial...');
    await normalizeAppointmentHistory(connection);

    console.log('Integridad estructural normalizada correctamente.');
  } finally {
    connection.release();
  }
};

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
