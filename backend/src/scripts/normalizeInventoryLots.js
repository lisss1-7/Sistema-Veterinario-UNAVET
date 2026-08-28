const pool = require('../config/db');

const columnInfo = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT *
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows[0] || null;
};

const columnExists = async (connection, table, column) =>
  Boolean(await columnInfo(connection, table, column));

const constraintExists = async (connection, constraint) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [constraint]
  );
  return rows.length > 0;
};

const indexExists = async (connection, table, index) => {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
};

const dropConstraint = async (connection, table, constraint) => {
  if (await constraintExists(connection, constraint)) {
    await connection.query(
      `ALTER TABLE ${table} DROP FOREIGN KEY ${constraint}`
    );
  }
};

const dropColumn = async (connection, table, column) => {
  if (await columnExists(connection, table, column)) {
    await connection.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    console.log('Creando catálogos y lotes de inventario...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS unidades_medida (
        unidad_medida_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(50) NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (unidad_medida_id),
        UNIQUE KEY uq_unidad_medida_nombre (nombre),
        CONSTRAINT chk_unidad_medida_activo CHECK (activo IN (0, 1))
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Catálogo de unidades utilizadas para controlar productos.'
    `);
    await dropColumn(connection, 'unidades_medida', 'abreviatura');

    if (!(await columnExists(
      connection,
      'productos_inventario',
      'unidad_medida_id'
    ))) {
      await connection.query(`
        ALTER TABLE productos_inventario
        ADD COLUMN unidad_medida_id INT UNSIGNED NULL
      `);
    }
    if (!(await columnExists(
      connection,
      'productos_inventario',
      'activo'
    ))) {
      await connection.query(`
        ALTER TABLE productos_inventario
        ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1
      `);
    }

    if (await columnExists(
      connection,
      'productos_inventario',
      'unidad_medida'
    )) {
      await connection.query(`
        INSERT INTO unidades_medida (nombre, activo)
        SELECT DISTINCT TRIM(unidad_medida), 1
        FROM productos_inventario
        WHERE unidad_medida IS NOT NULL
          AND TRIM(unidad_medida) <> ''
        ON DUPLICATE KEY UPDATE activo = 1
      `);
      await connection.query(`
        UPDATE productos_inventario producto
        INNER JOIN unidades_medida unidad
          ON unidad.nombre = TRIM(producto.unidad_medida)
        SET producto.unidad_medida_id = unidad.unidad_medida_id
      `);
    }

    if (await columnExists(
      connection,
      'productos_inventario',
      'estado_producto_id'
    )) {
      await connection.query(`
        UPDATE productos_inventario producto
        INNER JOIN estados_producto estado
          ON estado.estado_producto_id = producto.estado_producto_id
        SET producto.activo =
          CASE WHEN estado.nombre = 'Inactivo' THEN 0 ELSE 1 END
      `);
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS lotes_producto (
        producto_lote_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        producto_id BIGINT UNSIGNED NOT NULL,
        proveedor_id BIGINT UNSIGNED NULL,
        codigo_lote VARCHAR(80) NULL,
        fecha_vencimiento DATE NULL,
        precio_compra DECIMAL(10,2) NULL,
        stock INT UNSIGNED NOT NULL DEFAULT 0,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (producto_lote_id),
        UNIQUE KEY uq_lote_producto_codigo (producto_id, codigo_lote),
        KEY idx_lote_producto_vencimiento (
          producto_id,
          fecha_vencimiento
        ),
        KEY idx_lote_proveedor (proveedor_id),
        CONSTRAINT fk_lote_producto
          FOREIGN KEY (producto_id)
          REFERENCES productos_inventario (producto_id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_lote_proveedor
          FOREIGN KEY (proveedor_id)
          REFERENCES proveedores (proveedor_id)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT chk_lote_stock CHECK (stock >= 0),
        CONSTRAINT chk_lote_precio CHECK (
          precio_compra IS NULL OR precio_compra >= 0
        )
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Existencias de cada producto separadas por lote.'
    `);

    if (await columnExists(
      connection,
      'productos_inventario',
      'stock_actual'
    )) {
      await connection.query(`
        INSERT INTO lotes_producto (
          producto_id,
          proveedor_id,
          codigo_lote,
          fecha_vencimiento,
          precio_compra,
          stock,
          creado_en,
          actualizado_en
        )
        SELECT
          producto_id,
          proveedor_id,
          CONCAT('INICIAL-', producto_id),
          fecha_vencimiento,
          precio_compra,
          GREATEST(stock_actual, 0),
          creado_en,
          actualizado_en
        FROM productos_inventario
        ON DUPLICATE KEY UPDATE
          producto_id = VALUES(producto_id)
      `);
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS venta_detalle_lotes (
        detalle_id INT NOT NULL,
        producto_lote_id BIGINT UNSIGNED NOT NULL,
        cantidad INT UNSIGNED NOT NULL,
        PRIMARY KEY (detalle_id, producto_lote_id),
        KEY idx_venta_detalle_lote (producto_lote_id),
        CONSTRAINT fk_venta_detalle_lote_detalle
          FOREIGN KEY (detalle_id)
          REFERENCES cierre_ventas_detalle (detalle_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_venta_detalle_lote_lote
          FOREIGN KEY (producto_lote_id)
          REFERENCES lotes_producto (producto_lote_id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_venta_lote_cantidad CHECK (cantidad > 0)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Lotes específicos consumidos por cada producto vendido.'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS receta_medicamento_lotes (
        receta_medicamento_id BIGINT UNSIGNED NOT NULL,
        producto_lote_id BIGINT UNSIGNED NOT NULL,
        cantidad INT UNSIGNED NOT NULL,
        PRIMARY KEY (receta_medicamento_id, producto_lote_id),
        KEY idx_receta_medicamento_lote (producto_lote_id),
        CONSTRAINT fk_receta_medicamento_lote_medicamento
          FOREIGN KEY (receta_medicamento_id)
          REFERENCES receta_medicamentos (receta_medicamento_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_receta_medicamento_lote_lote
          FOREIGN KEY (producto_lote_id)
          REFERENCES lotes_producto (producto_lote_id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_receta_lote_cantidad CHECK (cantidad > 0)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
        COMMENT='Lotes específicos entregados en cada medicamento de receta.'
    `);

    console.log('Vinculando operaciones históricas con su lote migrado...');
    await connection.query(`
      INSERT IGNORE INTO venta_detalle_lotes (
        detalle_id,
        producto_lote_id,
        cantidad
      )
      SELECT
        detalle.detalle_id,
        lote.producto_lote_id,
        CAST(detalle.cantidad AS UNSIGNED)
      FROM cierre_ventas_detalle detalle
      INNER JOIN lotes_producto lote
        ON lote.producto_id = detalle.producto_id
       AND lote.codigo_lote =
         CONCAT('INICIAL-', detalle.producto_id)
      WHERE detalle.tipo = 'Producto'
        AND detalle.producto_id IS NOT NULL
        AND detalle.cantidad > 0
    `);
    await connection.query(`
      INSERT IGNORE INTO receta_medicamento_lotes (
        receta_medicamento_id,
        producto_lote_id,
        cantidad
      )
      SELECT
        medicamento.receta_medicamento_id,
        lote.producto_lote_id,
        medicamento.cantidad
      FROM receta_medicamentos medicamento
      INNER JOIN modos_entrega_receta modo
        ON modo.modo_entrega_id = medicamento.modo_entrega_id
       AND modo.descuenta_inventario = 1
      INNER JOIN lotes_producto lote
        ON lote.producto_id = medicamento.producto_id
       AND lote.codigo_lote =
         CONCAT('INICIAL-', medicamento.producto_id)
      WHERE medicamento.producto_id IS NOT NULL
        AND medicamento.cantidad > 0
    `);

    if (!(await columnExists(
      connection,
      'movimientos_inventario',
      'producto_lote_id'
    ))) {
      await connection.query(`
        ALTER TABLE movimientos_inventario
        ADD COLUMN producto_lote_id BIGINT UNSIGNED NULL
      `);
    }
    await connection.query(`
      ALTER TABLE movimientos_inventario
      MODIFY referencia_tipo
        ENUM(
          'Manual',
          'Receta',
          'Venta',
          'Compra',
          'Corrección',
          'Grooming'
        )
        NOT NULL DEFAULT 'Manual'
    `);
    if (!(await constraintExists(
      connection,
      'fk_movimiento_inventario_lote'
    ))) {
      await connection.query(`
        ALTER TABLE movimientos_inventario
        ADD CONSTRAINT fk_movimiento_inventario_lote
          FOREIGN KEY (producto_lote_id)
          REFERENCES lotes_producto (producto_lote_id)
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    const subtotalInfo = await columnInfo(
      connection,
      'cierre_ventas_detalle',
      'subtotal'
    );
    if (
      subtotalInfo &&
      !String(subtotalInfo.EXTRA || '').includes('GENERATED')
    ) {
      await connection.query(`
        ALTER TABLE cierre_ventas_detalle
        DROP COLUMN subtotal
      `);
      await connection.query(`
        ALTER TABLE cierre_ventas_detalle
        ADD COLUMN subtotal DECIMAL(12,2)
          GENERATED ALWAYS AS (
            ROUND(cantidad * precio_unitario, 2)
          ) STORED
      `);
    }

    // MySQL no permite un CHECK sobre estas columnas porque participan en
    // llaves foráneas con acciones referenciales. La exclusividad se valida
    // en el controlador y ambas referencias siguen protegidas por sus FKs.
    if (!(await constraintExists(
      connection,
      'chk_venta_detalle_cantidad'
    ))) {
      await connection.query(`
        ALTER TABLE cierre_ventas_detalle
        ADD CONSTRAINT chk_venta_detalle_cantidad CHECK (
          cantidad > 0 AND precio_unitario >= 0
        )
      `);
    }
    if (!(await constraintExists(
      connection,
      'chk_producto_valores'
    ))) {
      await connection.query(`
        ALTER TABLE productos_inventario
        ADD CONSTRAINT chk_producto_valores CHECK (
          stock_minimo >= 0
          AND (precio_venta IS NULL OR precio_venta >= 0)
          AND activo IN (0, 1)
        )
      `);
    }

    console.log('Retirando atributos de producto que pertenecen al lote...');
    const [[missingUnits]] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM productos_inventario
      WHERE unidad_medida_id IS NULL
    `);
    if (Number(missingUnits.total) > 0) {
      throw new Error(
        'Existen productos sin unidad de medida normalizada'
      );
    }

    if (!(await constraintExists(
      connection,
      'fk_producto_unidad_medida'
    ))) {
      await connection.query(`
        ALTER TABLE productos_inventario
        ADD CONSTRAINT fk_producto_unidad_medida
          FOREIGN KEY (unidad_medida_id)
          REFERENCES unidades_medida (unidad_medida_id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }
    await connection.query(`
      ALTER TABLE productos_inventario
      MODIFY unidad_medida_id INT UNSIGNED NOT NULL
    `);

    if (await indexExists(
      connection,
      'productos_inventario',
      'idx_productos_stock'
    )) {
      await connection.query(`
        ALTER TABLE productos_inventario
        DROP INDEX idx_productos_stock
      `);
    }
    await dropConstraint(
      connection,
      'productos_inventario',
      'fk_productos_proveedor'
    );
    await dropConstraint(
      connection,
      'productos_inventario',
      'fk_productos_inventario_estado_producto_id'
    );

    for (const column of [
      'unidad_medida',
      'stock_actual',
      'precio_compra',
      'fecha_vencimiento',
      'proveedor_id',
      'estado_producto_id',
    ]) {
      await dropColumn(connection, 'productos_inventario', column);
    }

    console.log('Inventario por lotes normalizado correctamente.');
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Falló la normalización del inventario:', error);
  process.exitCode = 1;
});
