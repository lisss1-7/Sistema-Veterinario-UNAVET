const pool = require('../config/db');

const scalar = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return Number(Object.values(rows[0])[0]);
};

const run = async () => {
  const legacyColumns = [
    ['paciente', 'fecha_nacimiento'],
    ['paciente', 'fecha_nacimiento_aproximada'],
    ['paciente', 'edad_estimada_meses'],
    ['paciente', 'fecha_estimacion_edad'],
    ['paciente', 'ultima_visita'],
    ['paciente', 'sexo'],
    ['paciente', 'estado_reproductivo'],
    ['cita_grooming', 'edad_mascota'],
    ['cita_grooming', 'fecha_nacimiento'],
    ['cita_grooming', 'fecha_nacimiento_aproximada'],
    ['cita_grooming', 'edad_estimada_meses'],
    ['cita_grooming', 'fecha_estimacion_edad'],
    ['cita_grooming', 'precio'],
    ['producto_inventario', 'unidad_medida'],
    ['producto_inventario', 'stock_actual'],
    ['producto_inventario', 'precio_compra'],
    ['producto_inventario', 'fecha_vencimiento'],
    ['producto_inventario', 'proveedor_id'],
    ['producto_inventario', 'estado_producto_id'],
    ['usuario', 'especialidad'],
    ['historial_clinico', 'palpitaciones'],
    ['historial_clinico', 'ojos'],
    ['historial_clinico', 'respiratorio'],
    ['historial_clinico', 'oidos'],
    ['historial_clinico', 'mucosa'],
    ['historial_clinico', 'conjuntiva'],
    ['historial_clinico', 'motilidad'],
    ['historial_clinico', 'prurito'],
    ['tratamiento_servicio', 'categoria'],
    ['receta', 'estado'],
    ['receta_medicamento', 'modo_entrega'],
    ['receta_medicamento', 'descuenta_inventario'],
  ];
  const legacyWhere = legacyColumns
    .map(() => '(TABLE_NAME = ? AND COLUMN_NAME = ?)')
    .join(' OR ');
  const legacyParams = legacyColumns.flat();

  const checks = {
    columnasLegacy: await scalar(
      `SELECT COUNT(*)
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (${legacyWhere})`,
      legacyParams
    ),
    tablaVacunacionesLegacy: await scalar(`
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'vacunaciones'
    `),
    nombresObligatoriosFaltantes: await scalar(`
      SELECT
        (SELECT COUNT(*) FROM tutor
         WHERE primer_nombre IS NULL OR TRIM(primer_nombre) = ''
            OR primer_apellido IS NULL OR TRIM(primer_apellido) = '')
        +
        (SELECT COUNT(*) FROM usuario
         WHERE primer_nombre IS NULL OR TRIM(primer_nombre) = ''
            OR primer_apellido IS NULL OR TRIM(primer_apellido) = '')
    `),
    nombresCompuestosLegacy: await scalar(`
      SELECT COUNT(*)
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('tutor', 'usuario')
        AND COLUMN_NAME = 'nombre'
    `),
    pacientesSinCatalogo: await scalar(`
      SELECT COUNT(*)
      FROM paciente
      WHERE sexo_id IS NULL
        OR especie_id IS NULL
        OR estado_reproductivo_id IS NULL
    `),
    pacientesSinEdad: await scalar(`
      SELECT COUNT(*)
      FROM paciente
      WHERE edad IS NULL OR TRIM(edad) = ''
    `),
    groomingSinEdad: await scalar(`
      SELECT COUNT(*)
      FROM cita_grooming
      WHERE edad IS NULL OR TRIM(edad) = ''
    `),
    razasDeOtraEspecie: await scalar(`
      SELECT COUNT(*)
      FROM paciente paciente
      INNER JOIN raza raza ON raza.raza_id = paciente.raza_id
      WHERE paciente.especie_id <> raza.especie_id
    `),
    citasSinCatalogo: await scalar(`
      SELECT COUNT(*)
      FROM cita_clinica
      WHERE estado_cita_id IS NULL
    `),
    groomingSinCatalogo: await scalar(`
      SELECT COUNT(*)
      FROM cita_grooming
      WHERE tipo_grooming_id IS NULL
        OR estado_grooming_id IS NULL
        OR tamano_animal_id IS NULL
    `),
    historialesCompletadosSinVeterinario: await scalar(`
      SELECT COUNT(*)
      FROM historial_clinico
      WHERE estado_clinico = 'Completado'
        AND veterinario_id IS NULL
    `),
    historialesDuplicadosPorCita: await scalar(`
      SELECT COUNT(*)
      FROM (
        SELECT cita_id
        FROM historial_clinico
        WHERE cita_id IS NOT NULL
        GROUP BY cita_id
        HAVING COUNT(*) > 1
      ) duplicados
    `),
    examenesSinCatalogo: await scalar(`
      SELECT COUNT(*)
      FROM historial_examen_fisico detalle
      LEFT JOIN parametro_examen_fisico parametro
        ON parametro.parametro_id = detalle.parametro_id
      LEFT JOIN estado_examen_fisico estado
        ON estado.estado_examen_id = detalle.estado_examen_id
      WHERE parametro.parametro_id IS NULL
         OR estado.estado_examen_id IS NULL
    `),
    esquemasInvalidos: await scalar(`
      SELECT COUNT(*)
      FROM esquema_vacunacion_paciente esquema
      LEFT JOIN (
        SELECT esquema_id, COUNT(*) AS dosis
        FROM aplicacion_vacuna
        GROUP BY esquema_id
      ) aplicaciones
        ON aplicaciones.esquema_id = esquema.esquema_id
      WHERE esquema.dosis_totales < 1
         OR COALESCE(aplicaciones.dosis, 0) > esquema.dosis_totales
         OR (
           (esquema.intervalo IS NULL) <>
           (esquema.unidad_intervalo_id IS NULL)
         )
    `),
    aplicacionesInvalidas: await scalar(`
      SELECT COUNT(*)
      FROM aplicacion_vacuna
      WHERE numero_dosis < 1
        OR (
          fecha_desconocida = 0
          AND fecha_aplicacion IS NULL
        )
        OR (
          fecha_desconocida = 1
          AND fecha_aplicacion IS NOT NULL
        )
    `),
    tratamientosSinCatalogo: await scalar(`
      SELECT COUNT(*)
      FROM tratamiento_servicio tratamiento
      INNER JOIN tipo_tratamiento tipo
        ON tipo.tipo_tratamiento_id = tratamiento.tipo_tratamiento_id
      WHERE tratamiento.estado_tratamiento_id IS NULL
         OR tratamiento.tipo_tratamiento_id IS NULL
         OR (
           tipo.nombre = 'Servicio de laboratorio'
           AND (
             tratamiento.prueba_laboratorio_id IS NULL
             OR tratamiento.nombre IS NOT NULL
           )
         )
         OR (
           tipo.nombre <> 'Servicio de laboratorio'
           AND tratamiento.nombre IS NULL
         )
    `),
    productosSinUnidadOLote: await scalar(`
      SELECT COUNT(*)
      FROM producto_inventario producto
      WHERE producto.unidad_medida_id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM lote_producto lote
           WHERE lote.producto_id = producto.producto_id
         )
    `),
    lotesInvalidos: await scalar(`
      SELECT COUNT(*)
      FROM lote_producto
      WHERE stock < 0
        OR (precio_compra IS NOT NULL AND precio_compra < 0)
    `),
    ventasConReferenciaInvalida: await scalar(`
      SELECT COUNT(*)
      FROM cierre_venta_detalle
      WHERE NOT (
        (
          tipo = 'Producto'
          AND producto_id IS NOT NULL
          AND servicio_id IS NULL
        )
        OR
        (
          tipo = 'Servicio'
          AND servicio_id IS NOT NULL
          AND producto_id IS NULL
        )
      )
    `),
    ventasSinAsignacionDeLote: await scalar(`
      SELECT COUNT(*)
      FROM cierre_venta_detalle detalle
      LEFT JOIN (
        SELECT detalle_id, SUM(cantidad) AS cantidad
        FROM venta_detalle_lote
        GROUP BY detalle_id
      ) asignacion ON asignacion.detalle_id = detalle.detalle_id
      WHERE detalle.tipo = 'Producto'
        AND ABS(
          detalle.cantidad - COALESCE(asignacion.cantidad, 0)
        ) > 0.009
    `),
    recetasSinAsignacionDeLote: await scalar(`
      SELECT COUNT(*)
      FROM receta_medicamento medicamento
      INNER JOIN modo_entrega_receta modo
        ON modo.modo_entrega_id = medicamento.modo_entrega_id
      LEFT JOIN (
        SELECT receta_medicamento_id, SUM(cantidad) AS cantidad
        FROM receta_medicamento_lote
        GROUP BY receta_medicamento_id
      ) asignacion
        ON asignacion.receta_medicamento_id =
          medicamento.receta_medicamento_id
      WHERE modo.descuenta_inventario = 1
        AND ABS(
          medicamento.cantidad - COALESCE(asignacion.cantidad, 0)
        ) > 0
    `),
    ventasSinPago: await scalar(`
      SELECT COUNT(*)
      FROM cierre_venta venta
      WHERE EXISTS (
        SELECT 1
        FROM cierre_venta_detalle detalle
        WHERE detalle.venta_id = venta.venta_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM venta_pago pago
        WHERE pago.venta_id = venta.venta_id
      )
    `),
    pagosQueNoCuadran: await scalar(`
      SELECT COUNT(*)
      FROM cierre_venta venta
      LEFT JOIN (
        SELECT venta_id, SUM(subtotal) AS total
        FROM cierre_venta_detalle
        GROUP BY venta_id
      ) detalle ON detalle.venta_id = venta.venta_id
      LEFT JOIN (
        SELECT venta_id, SUM(monto) AS total
        FROM venta_pago
        GROUP BY venta_id
      ) pago ON pago.venta_id = venta.venta_id
      WHERE ABS(
        COALESCE(detalle.total, 0) - COALESCE(pago.total, 0)
      ) > 0.009
    `),
    horariosDuplicados: await scalar(`
      SELECT COUNT(*)
      FROM (
        SELECT 1
        FROM horario_atencion
        GROUP BY modulo_id, IFNULL(tipo_grooming_id, 0), dia_semana
        HAVING COUNT(*) > 1
      ) duplicados
    `),
    especialidadesHuerfanas: await scalar(`
      SELECT COUNT(*)
      FROM usuario_especialidad relacion
      LEFT JOIN usuario usuario
        ON usuario.usuario_id = relacion.usuario_id
      LEFT JOIN especialidad especialidad
        ON especialidad.especialidad_id = relacion.especialidad_id
      WHERE usuario.usuario_id IS NULL
         OR especialidad.especialidad_id IS NULL
    `),
  };

  console.table(checks);
  const failures = Object.entries(checks).filter(
    ([, value]) => value !== 0
  );
  if (failures.length > 0) {
    throw new Error(
      `Fallaron comprobaciones de integridad: ${failures
        .map(([name, value]) => `${name}=${value}`)
        .join(', ')}`
    );
  }
  console.log(
    'Integridad y normalización verificadas correctamente.'
  );
};

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
