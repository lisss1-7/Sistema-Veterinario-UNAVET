const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const sourceTables = [
  'cierres_ventas',
  'cierre_ventas_detalle',
  'citas_clinicas',
  'citas_grooming',
  'pacientes',
  'historial_clinico',
  'tratamientos_servicios',
  'vacunaciones',
  'receta_medicamentos',
  'productos_inventario',
];

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

const addColumn = async (connection, table, column, definition) => {
  if (!(await columnExists(connection, table, column))) {
    await connection.query(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
};

const constraintExists = async (connection, constraintName) => {
  const [rows] = await connection.query(
    `
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
    [constraintName]
  );
  return rows.length > 0;
};

const addForeignKey = async (connection, table, name, sql) => {
  if (!(await constraintExists(connection, name))) {
    await connection.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${sql}`);
  }
};

const createBackup = async (connection) => {
  const backup = {
    createdAt: new Date().toISOString(),
    database: process.env.DB_NAME,
    tables: {},
  };

  for (const table of sourceTables) {
    const [rows] = await connection.query(`SELECT * FROM ${table}`);
    backup.tables[table] = rows;
  }

  const backupDir = path.join(__dirname, '../../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupDir,
    `before-normalization-${safeDate}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  return backupPath;
};

const parseJson = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const run = async () => {
  const connection = await pool.getConnection();

  try {
    const [finalizedSchema] = await connection.query(`
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'esquemas_vacunacion_paciente'
      LIMIT 1
    `);
    if (finalizedSchema.length > 0) {
      console.log(
        'La base ya utiliza el esquema normalizado final; no se reaplican migraciones legadas.'
      );
      return;
    }

    const backupPath = await createBackup(connection);
    console.log(`Respaldo creado: ${backupPath}`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS categorias_servicio (
        categoria_servicio_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion VARCHAR(255) NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_categoria_servicio_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS servicios (
        servicio_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        categoria_servicio_id INT UNSIGNED NOT NULL,
        nombre VARCHAR(180) NOT NULL,
        descripcion VARCHAR(255) NULL,
        precio_base DECIMAL(10,2) NULL,
        controla_inventario TINYINT(1) NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_servicio_nombre (nombre),
        CONSTRAINT fk_servicios_categoria
          FOREIGN KEY (categoria_servicio_id)
          REFERENCES categorias_servicio(categoria_servicio_id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO categorias_servicio (nombre, descripcion) VALUES
      ('Administrativo', 'Movimientos administrativos y de caja'),
      ('Clínico', 'Consultas y servicios médicos'),
      ('Laboratorio', 'Pruebas y servicios de laboratorio'),
      ('Grooming', 'Servicios de estética y transporte')
    `);

    await connection.query(`
      INSERT IGNORE INTO servicios
        (categoria_servicio_id, nombre, descripcion, precio_base)
      SELECT categoria_servicio_id, 'Caja', 'Movimiento de caja', NULL
      FROM categorias_servicio WHERE nombre = 'Administrativo'
      UNION ALL
      SELECT categoria_servicio_id, 'Consulta', 'Consulta veterinaria', NULL
      FROM categorias_servicio WHERE nombre = 'Clínico'
      UNION ALL
      SELECT categoria_servicio_id, 'Hematología', 'Servicio de hematología', NULL
      FROM categorias_servicio WHERE nombre = 'Laboratorio'
      UNION ALL
      SELECT categoria_servicio_id, 'Grooming', 'Grooming en clínica', NULL
      FROM categorias_servicio WHERE nombre = 'Grooming'
      UNION ALL
      SELECT categoria_servicio_id, 'Grooming con domicilio', 'Grooming con transporte a domicilio', NULL
      FROM categorias_servicio WHERE nombre = 'Grooming'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS formas_pago (
        forma_pago_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_forma_pago_codigo (codigo),
        UNIQUE KEY uq_forma_pago_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO formas_pago (codigo, nombre, orden) VALUES
      ('transferencia_bi', 'Transferencia BI', 1),
      ('transferencia_ba', 'Transferencia BA', 2),
      ('tarjeta_bac', 'Tarjeta BAC', 3),
      ('tarjeta_bi', 'Tarjeta BI', 4),
      ('efectivo', 'Efectivo', 5)
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS venta_pagos (
        venta_pago_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        venta_id INT NOT NULL,
        forma_pago_id INT UNSIGNED NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        referencia VARCHAR(120) NULL,
        UNIQUE KEY uq_venta_forma_pago (venta_id, forma_pago_id),
        CONSTRAINT fk_venta_pagos_venta
          FOREIGN KEY (venta_id) REFERENCES cierres_ventas(venta_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_venta_pagos_forma
          FOREIGN KEY (forma_pago_id) REFERENCES formas_pago(forma_pago_id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (
      await columnExists(connection, 'cierres_ventas', 'transferencia_bi')
    ) {
      await connection.query(`
        INSERT IGNORE INTO venta_pagos (venta_id, forma_pago_id, monto)
        SELECT v.venta_id, fp.forma_pago_id,
          CASE fp.codigo
            WHEN 'transferencia_bi' THEN v.transferencia_bi
            WHEN 'transferencia_ba' THEN v.transferencia_ba
            WHEN 'tarjeta_bac' THEN v.tarjeta_bac
            WHEN 'tarjeta_bi' THEN v.tarjeta_bi
            WHEN 'efectivo' THEN v.efectivo
          END
        FROM cierres_ventas v
        CROSS JOIN formas_pago fp
        WHERE CASE fp.codigo
            WHEN 'transferencia_bi' THEN v.transferencia_bi
            WHEN 'transferencia_ba' THEN v.transferencia_ba
            WHEN 'tarjeta_bac' THEN v.tarjeta_bac
            WHEN 'tarjeta_bi' THEN v.tarjeta_bi
            WHEN 'efectivo' THEN v.efectivo
          END > 0
      `);
    }

    await addColumn(
      connection,
      'cierre_ventas_detalle',
      'servicio_id',
      'BIGINT UNSIGNED NULL AFTER producto_id'
    );
    await connection.query(`
      UPDATE cierre_ventas_detalle d
      INNER JOIN servicios s
        ON s.nombre COLLATE utf8mb4_0900_ai_ci = d.descripcion
      SET d.servicio_id = s.servicio_id
      WHERE d.tipo = 'Servicio' AND d.servicio_id IS NULL
    `);
    await addForeignKey(
      connection,
      'cierre_ventas_detalle',
      'fk_cierre_detalle_servicio',
      'FOREIGN KEY (servicio_id) REFERENCES servicios(servicio_id) ON DELETE RESTRICT ON UPDATE CASCADE'
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS modulos_sistema (
        modulo_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(60) NOT NULL,
        nombre VARCHAR(120) NOT NULL,
        ruta VARCHAR(160) NULL,
        orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_modulo_codigo (codigo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO modulos_sistema (codigo, nombre, ruta, orden) VALUES
      ('dashboard', 'Dashboard', '/', 1),
      ('patients', 'Pacientes', '/patients', 2),
      ('appointments', 'Citas', '/appointments', 3),
      ('grooming', 'Grooming', '/grooming', 4),
      ('inventory', 'Inventario', '/inventory', 5),
      ('prescriptions', 'Recetas', '/prescriptions', 6),
      ('aiReports', 'Reportes IA', '/ai-reports', 7),
      ('users', 'Usuarios', '/users', 8),
      ('profile', 'Mi perfil', '/profile', 9)
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS rol_permisos (
        rol_id INT UNSIGNED NOT NULL,
        modulo_id INT UNSIGNED NOT NULL,
        puede_ver TINYINT(1) NOT NULL DEFAULT 1,
        puede_crear TINYINT(1) NOT NULL DEFAULT 0,
        puede_editar TINYINT(1) NOT NULL DEFAULT 0,
        puede_eliminar TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (rol_id, modulo_id),
        CONSTRAINT fk_rol_permisos_rol
          FOREIGN KEY (rol_id) REFERENCES roles(rol_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_rol_permisos_modulo
          FOREIGN KEY (modulo_id) REFERENCES modulos_sistema(modulo_id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO rol_permisos
        (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
      SELECT r.rol_id, m.modulo_id, 1, 1, 1, 1
      FROM roles r CROSS JOIN modulos_sistema m
      WHERE r.nombre = 'Administrador'
    `);
    await connection.query(`
      INSERT IGNORE INTO rol_permisos
        (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
      SELECT r.rol_id, m.modulo_id, 1, 1, 1, 0
      FROM roles r
      JOIN modulos_sistema m
        ON m.codigo IN ('dashboard','patients','appointments','grooming','prescriptions','aiReports','profile')
      WHERE r.nombre = 'Médico Veterinario'
    `);
    await connection.query(`
      INSERT IGNORE INTO rol_permisos
        (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
      SELECT r.rol_id, m.modulo_id, 1, 1, 1, 0
      FROM roles r
      JOIN modulos_sistema m
        ON m.codigo IN ('dashboard','patients','appointments','grooming','inventory','profile')
      WHERE r.nombre = 'Asistente'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS horarios_atencion (
        horario_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
        UNIQUE KEY uq_horario_modulo_tipo_dia_normalizado
          (modulo_id, tipo_grooming_clave, dia_semana),
        CONSTRAINT fk_horarios_modulo
          FOREIGN KEY (modulo_id) REFERENCES modulos_sistema(modulo_id)
          ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_horarios_tipo_grooming
          FOREIGN KEY (tipo_grooming_id) REFERENCES tipos_grooming(tipo_grooming_id)
          ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await addColumn(
      connection,
      'tipos_grooming',
      'requiere_transporte',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await addColumn(
      connection,
      'tipos_grooming',
      'modalidad_legacy',
      'VARCHAR(60) NULL'
    );
    await connection.query(`
      UPDATE tipos_grooming
      SET requiere_transporte =
            CASE WHEN LOWER(nombre) LIKE '%transporte%' THEN 1 ELSE 0 END,
          modalidad_legacy =
            CASE
              WHEN LOWER(nombre) LIKE '%transporte%' THEN 'Con transporte'
              ELSE 'En clínica'
            END
    `);

    await connection.query(`
      INSERT IGNORE INTO horarios_atencion
        (modulo_id, tipo_grooming_id, dia_semana, hora_inicio, hora_fin, intervalo_minutos, capacidad_diaria)
      SELECT m.modulo_id, NULL, days.dia, '09:00:00', '23:00:00', 60, NULL
      FROM modulos_sistema m
      CROSS JOIN (
        SELECT 0 dia UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
      ) days
      WHERE m.codigo = 'appointments'
    `);
    await connection.query(`
      INSERT IGNORE INTO horarios_atencion
        (modulo_id, tipo_grooming_id, dia_semana, hora_inicio, hora_fin, intervalo_minutos, capacidad_diaria)
      SELECT m.modulo_id, tg.tipo_grooming_id, days.dia,
        '09:00:00',
        CASE WHEN tg.nombre LIKE '%transporte%' THEN '17:00:00' ELSE '15:00:00' END,
        60,
        CASE WHEN tg.nombre LIKE '%transporte%' THEN 5 ELSE NULL END
      FROM modulos_sistema m
      CROSS JOIN tipos_grooming tg
      CROSS JOIN (
        SELECT 0 dia UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
      ) days
      WHERE m.codigo = 'grooming'
    `);

    await addColumn(connection, 'citas_grooming', 'edad', 'VARCHAR(30) NULL');
    await addColumn(
      connection,
      'citas_grooming',
      'codigo_acceso',
      'VARCHAR(100) NULL'
    );
    await addColumn(
      connection,
      'citas_grooming',
      'costo_grooming',
      'DECIMAL(10,2) NULL'
    );
    await addColumn(
      connection,
      'citas_grooming',
      'costo_transporte',
      'DECIMAL(10,2) NULL'
    );

    const [groomingRows] = await connection.query(
      'SELECT grooming_id, observaciones, precio FROM citas_grooming'
    );
    for (const row of groomingRows) {
      const extra = parseJson(row.observaciones);
      if (!extra) continue;
      await connection.query(
        `
        UPDATE citas_grooming
        SET edad = ?, codigo_acceso = ?, costo_grooming = ?,
            costo_transporte = ?, observaciones = ?
        WHERE grooming_id = ?
        `,
        [
          extra.age || null,
          extra.accessCode || null,
          Number(extra.groomingCost) || Number(row.precio) || 0,
          Number(extra.transportCost) || 0,
          extra.observations || null,
          row.grooming_id,
        ]
      );
    }

    await addColumn(
      connection,
      'tratamientos_servicios',
      'categoria',
      'VARCHAR(120) NULL'
    );
    await addColumn(
      connection,
      'tratamientos_servicios',
      'estado_presentacion',
      'VARCHAR(100) NULL'
    );
    await addColumn(
      connection,
      'tratamientos_servicios',
      'foto_adjunta',
      'LONGTEXT NULL'
    );

    const [treatmentRows] = await connection.query(
      'SELECT tratamiento_id, observaciones FROM tratamientos_servicios'
    );
    for (const row of treatmentRows) {
      const extra = parseJson(row.observaciones);
      if (!extra) continue;
      await connection.query(
        `
        UPDATE tratamientos_servicios
        SET categoria = ?, estado_presentacion = ?,
            foto_adjunta = ?, observaciones = ?
        WHERE tratamiento_id = ?
        `,
        [
          extra.category || null,
          extra.frontendStatus || null,
          extra.attachmentPhoto || null,
          extra.observations || null,
          row.tratamiento_id,
        ]
      );
    }

    await addColumn(
      connection,
      'tipos_tratamiento',
      'valor_legacy',
      'VARCHAR(50) NULL'
    );
    await connection.query(`
      UPDATE tipos_tratamiento
      SET valor_legacy =
        CASE nombre
          WHEN 'Tratamiento médico' THEN 'Tratamiento'
          WHEN 'Servicio de laboratorio' THEN 'Laboratorio'
          ELSE 'Servicio'
        END
    `);
    await addColumn(
      connection,
      'estados_tratamiento',
      'valor_legacy',
      'VARCHAR(50) NULL'
    );
    await connection.query(`
      UPDATE estados_tratamiento
      SET valor_legacy =
        CASE nombre
          WHEN 'Activo' THEN 'En proceso'
          WHEN 'Suspendido' THEN 'Cancelado'
          WHEN 'Solicitado' THEN 'Pendiente'
          WHEN 'Resultado pendiente' THEN 'En proceso'
          WHEN 'Resultado recibido' THEN 'Completado'
          ELSE nombre
        END
    `);

    await addColumn(
      connection,
      'vacunaciones',
      'dosis_aplicadas',
      'SMALLINT UNSIGNED NOT NULL DEFAULT 0'
    );
    await addColumn(
      connection,
      'vacunaciones',
      'dosis_totales',
      'SMALLINT UNSIGNED NOT NULL DEFAULT 0'
    );
    await addColumn(
      connection,
      'vacunaciones',
      'intervalo',
      'SMALLINT UNSIGNED NULL'
    );
    await addColumn(
      connection,
      'vacunaciones',
      'unidad_intervalo_id',
      'INT NULL'
    );
    await addForeignKey(
      connection,
      'vacunaciones',
      'fk_vacunaciones_unidad_intervalo',
      'FOREIGN KEY (unidad_intervalo_id) REFERENCES unidades_intervalo(unidad_intervalo_id) ON DELETE SET NULL ON UPDATE CASCADE'
    );
    await addColumn(
      connection,
      'unidades_intervalo',
      'dias_por_unidad',
      'DECIMAL(8,2) NULL'
    );
    await addColumn(
      connection,
      'unidades_intervalo',
      'meses_por_unidad',
      'DECIMAL(8,2) NULL'
    );
    await connection.query(`
      UPDATE unidades_intervalo
      SET dias_por_unidad =
            CASE WHEN LOWER(nombre) IN ('semana', 'semanas') THEN 7 ELSE dias_por_unidad END,
          meses_por_unidad =
            CASE WHEN LOWER(nombre) IN ('mes', 'meses') THEN 1 ELSE meses_por_unidad END
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS estados_vacunacion (
        estado_vacunacion_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(80) NOT NULL,
        valor_legacy VARCHAR(50) NOT NULL,
        es_aplicada TINYINT(1) NOT NULL DEFAULT 0,
        requiere_proxima_dosis TINYINT(1) NOT NULL DEFAULT 0,
        es_vencida TINYINT(1) NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_estado_vacunacion_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      INSERT IGNORE INTO estados_vacunacion
        (nombre, valor_legacy, es_aplicada, requiere_proxima_dosis, es_vencida)
      VALUES
        ('Completado', 'Aplicada', 1, 0, 0),
        ('Próxima dosis', 'Pendiente', 0, 1, 0),
        ('Vencida', 'Vencida', 0, 0, 1)
    `);
    await addColumn(
      connection,
      'vacunaciones',
      'estado_vacunacion_id',
      'INT UNSIGNED NULL'
    );
    await connection.query(`
      UPDATE vacunaciones target
      INNER JOIN estados_vacunacion catalog
        ON catalog.valor_legacy = target.estado
      SET target.estado_vacunacion_id = catalog.estado_vacunacion_id
      WHERE target.estado_vacunacion_id IS NULL
    `);
    await addForeignKey(
      connection,
      'vacunaciones',
      'fk_vacunaciones_estado',
      'FOREIGN KEY (estado_vacunacion_id) REFERENCES estados_vacunacion(estado_vacunacion_id) ON DELETE RESTRICT ON UPDATE CASCADE'
    );

    const [vaccinationRows] = await connection.query(
      'SELECT vacunacion_id, observaciones FROM vacunaciones'
    );
    for (const row of vaccinationRows) {
      const extra = parseJson(row.observaciones);
      if (!extra) continue;
      let unitId = null;
      if (extra.intervalUnit) {
        const [units] = await connection.query(
          'SELECT unidad_intervalo_id FROM unidades_intervalo WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
          [extra.intervalUnit]
        );
        unitId = units[0]?.unidad_intervalo_id || null;
      }
      await connection.query(
        `
        UPDATE vacunaciones
        SET dosis_aplicadas = ?, dosis_totales = ?, intervalo = ?,
            unidad_intervalo_id = ?, observaciones = ?
        WHERE vacunacion_id = ?
        `,
        [
          Number(extra.appliedDoses) || 0,
          Number(extra.totalDoses) || 0,
          Number(extra.interval) || null,
          unitId,
          extra.notes || null,
          row.vacunacion_id,
        ]
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS estados_usuario (
        estado_usuario_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        descripcion VARCHAR(150) NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_estado_usuario_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      INSERT IGNORE INTO estados_usuario (nombre, descripcion) VALUES
      ('Activo', 'Usuario habilitado para ingresar al sistema'),
      ('Inactivo', 'Usuario sin acceso al sistema')
    `);
    await addColumn(
      connection,
      'estados_usuario',
      'permite_acceso',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await connection.query(`
      UPDATE estados_usuario
      SET permite_acceso = CASE WHEN nombre = 'Activo' THEN 1 ELSE 0 END
    `);
    for (const statusTable of ['estados_cita', 'estados_grooming']) {
      await addColumn(
        connection,
        statusTable,
        'es_inicial',
        'TINYINT(1) NOT NULL DEFAULT 0'
      );
      await addColumn(
        connection,
        statusTable,
        'es_cancelado',
        'TINYINT(1) NOT NULL DEFAULT 0'
      );
      await addColumn(
        connection,
        statusTable,
        'es_completado',
        'TINYINT(1) NOT NULL DEFAULT 0'
      );
      await connection.query(`
        UPDATE ${statusTable}
        SET es_inicial = CASE WHEN nombre = 'Pendiente' THEN 1 ELSE 0 END,
            es_cancelado = CASE WHEN nombre = 'Cancelada' THEN 1 ELSE 0 END,
            es_completado = CASE WHEN nombre = 'Completada' THEN 1 ELSE 0 END
      `);
    }
    await addColumn(
      connection,
      'modos_entrega_receta',
      'descuenta_inventario',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await connection.query(`
      UPDATE modos_entrega_receta
      SET descuenta_inventario =
        CASE WHEN nombre = 'Entregado en clínica' THEN 1 ELSE 0 END
    `);
    await connection.query(`
      INSERT IGNORE INTO estados_producto
        (nombre, descripcion, activo)
      VALUES ('Agotado', 'Producto sin existencias disponibles', 1)
    `);
    await addColumn(
      connection,
      'estados_producto',
      'es_inicial',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await addColumn(
      connection,
      'estados_producto',
      'sin_existencias',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await connection.query(`
      UPDATE estados_producto
      SET es_inicial = CASE WHEN nombre = 'Activo' THEN 1 ELSE 0 END,
          sin_existencias = CASE WHEN nombre = 'Agotado' THEN 1 ELSE 0 END
    `);

    await connection.query(
      'ALTER TABLE cierres_ventas MODIFY COLUMN usuario_id BIGINT UNSIGNED NULL'
    );
    await addForeignKey(
      connection,
      'cierres_ventas',
      'fk_cierres_ventas_usuario',
      'FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id) ON DELETE SET NULL ON UPDATE CASCADE'
    );

    const catalogLinks = [
      ['usuarios', 'estado_usuario_id', 'INT UNSIGNED NULL', 'estados_usuario', 'estado_usuario_id', 'estado', 'nombre'],
      ['pacientes', 'sexo_id', 'INT NULL', 'sexos', 'sexo_id', 'sexo', 'nombre'],
      ['pacientes', 'estado_reproductivo_id', 'INT NULL', 'estados_reproductivos', 'estado_reproductivo_id', 'estado_reproductivo', 'nombre'],
      ['citas_clinicas', 'estado_cita_id', 'INT NULL', 'estados_cita', 'estado_cita_id', 'estado', 'nombre'],
      ['citas_clinicas', 'tamano_animal_id', 'INT NULL', 'tamanos_animales', 'tamano_animal_id', 'tamano_mascota', 'nombre'],
      ['citas_grooming', 'estado_grooming_id', 'INT NULL', 'estados_grooming', 'estado_grooming_id', 'estado', 'nombre'],
      ['productos_inventario', 'estado_producto_id', 'INT NULL', 'estados_producto', 'estado_producto_id', 'estado', 'nombre'],
      ['historial_clinico', 'tipo_consulta_id', 'INT NULL', 'tipos_consulta', 'tipo_consulta_id', 'tipo_consulta', 'nombre'],
      ['tratamientos_servicios', 'estado_tratamiento_id', 'INT NULL', 'estados_tratamiento', 'estado_tratamiento_id', 'estado_presentacion', 'nombre'],
      ['vacunaciones', 'vacuna_catalogo_id', 'INT NULL', 'vacunas_catalogo', 'vacuna_id', 'nombre_vacuna', 'nombre'],
      ['receta_medicamentos', 'modo_entrega_id', 'INT NULL', 'modos_entrega_receta', 'modo_entrega_id', 'modo_entrega', 'nombre'],
    ];

    for (const [
      table,
      idColumn,
      definition,
      catalogTable,
      catalogId,
      textColumn,
      catalogName,
    ] of catalogLinks) {
      await addColumn(connection, table, idColumn, definition);
      await connection.query(`
        UPDATE ${table} target
        INNER JOIN ${catalogTable} catalog
          ON catalog.${catalogName} = target.${textColumn}
        SET target.${idColumn} = catalog.${catalogId}
        WHERE target.${idColumn} IS NULL
      `);
      await addForeignKey(
        connection,
        table,
        `fk_${table}_${idColumn}`,
        `FOREIGN KEY (${idColumn}) REFERENCES ${catalogTable}(${catalogId}) ON DELETE SET NULL ON UPDATE CASCADE`
      );
    }

    await addColumn(
      connection,
      'citas_grooming',
      'tipo_grooming_id',
      'INT NULL'
    );
    await connection.query(`
      UPDATE citas_grooming target
      INNER JOIN tipos_grooming catalog
        ON catalog.modalidad_legacy = target.modalidad
      SET target.tipo_grooming_id = catalog.tipo_grooming_id
      WHERE target.tipo_grooming_id IS NULL
    `);
    await addForeignKey(
      connection,
      'citas_grooming',
      'fk_citas_grooming_tipo_grooming_id',
      'FOREIGN KEY (tipo_grooming_id) REFERENCES tipos_grooming(tipo_grooming_id) ON DELETE SET NULL ON UPDATE CASCADE'
    );

    await addColumn(
      connection,
      'tratamientos_servicios',
      'tipo_tratamiento_id',
      'INT NULL'
    );
    await connection.query(`
      UPDATE tratamientos_servicios target
      INNER JOIN tipos_tratamiento catalog
        ON catalog.nombre =
          CASE target.tipo
            WHEN 'Tratamiento' THEN 'Tratamiento médico'
            WHEN 'Laboratorio' THEN 'Servicio de laboratorio'
            ELSE target.tipo
          END
      SET target.tipo_tratamiento_id = catalog.tipo_tratamiento_id
    `);
    await addForeignKey(
      connection,
      'tratamientos_servicios',
      'fk_tratamientos_tipo_catalogo',
      'FOREIGN KEY (tipo_tratamiento_id) REFERENCES tipos_tratamiento(tipo_tratamiento_id) ON DELETE SET NULL ON UPDATE CASCADE'
    );

    console.log('Normalización aplicada correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Error durante la normalización:', error);
  process.exit(1);
});
