const pool = require('../config/db');

const formatTime = (timeValue) => {
  if (!timeValue) return '';

  if (typeof timeValue === 'string') {
    return timeValue.slice(0, 5);
  }

  return String(timeValue).slice(0, 5);
};

const getCount = async (query, params = []) => {
  const [rows] = await pool.query(query, params);
  return Number(rows[0]?.total || 0);
};

const obtenerResumenDashboard = async (req, res) => {
  try {
    const [
      totalPatients,
      todayAppointments,
      todayGrooming,
      upcomingVaccines,
      inventoryProducts,
      lowStock,
      prescriptions,
    ] = await Promise.all([
      getCount('SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1'),
      getCount('SELECT COUNT(*) AS total FROM citas_clinicas WHERE fecha = CURDATE()'),
      getCount('SELECT COUNT(*) AS total FROM citas_grooming WHERE fecha = CURDATE()'),
      getCount(`
        SELECT COUNT(*) AS total
        FROM esquemas_vacunacion_paciente esquema
        LEFT JOIN unidades_intervalo unidad
          ON unidad.unidad_intervalo_id = esquema.unidad_intervalo_id
        LEFT JOIN (
          SELECT
            esquema_id,
            COUNT(*) AS dosis_aplicadas,
            MAX(fecha_aplicacion) AS ultima_aplicacion
          FROM aplicaciones_vacuna
          GROUP BY esquema_id
        ) aplicaciones
          ON aplicaciones.esquema_id = esquema.esquema_id
        WHERE COALESCE(aplicaciones.dosis_aplicadas, 0) <
            esquema.dosis_totales
          AND (
            CASE
              WHEN unidad.nombre = 'semanas'
                THEN DATE_ADD(
                  aplicaciones.ultima_aplicacion,
                  INTERVAL esquema.intervalo WEEK
                )
              WHEN unidad.nombre = 'meses'
                THEN DATE_ADD(
                  aplicaciones.ultima_aplicacion,
                  INTERVAL esquema.intervalo MONTH
                )
              ELSE NULL
            END
          ) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      `),
      getCount(
        'SELECT COUNT(*) AS total FROM productos_inventario WHERE activo = 1'
      ),
      getCount(`
        SELECT COUNT(*) AS total
        FROM productos_inventario producto
        LEFT JOIN (
          SELECT producto_id, SUM(stock) AS stock_actual
          FROM lotes_producto
          GROUP BY producto_id
        ) lotes ON lotes.producto_id = producto.producto_id
        WHERE producto.activo = 1
          AND COALESCE(lotes.stock_actual, 0) <= producto.stock_minimo
      `),
      getCount(`
        SELECT COUNT(*) AS total
        FROM recetas receta
        INNER JOIN estados_receta estado
          ON estado.estado_receta_id = receta.estado_receta_id
        WHERE estado.es_anulado = 0
      `),
    ]);

    const [appointmentsRows] = await pool.query(
      `
      SELECT
        cita_id,
        nombre_mascota,
        CONCAT_WS(
          ' ',
          tutor_primer_nombre,
          tutor_segundo_nombre,
          tutor_primer_apellido,
          tutor_segundo_apellido
        ) AS nombre_tutor,
        motivo,
        hora,
        estado_catalogo.nombre AS estado
      FROM citas_clinicas cita
      INNER JOIN estados_cita estado_catalogo
        ON estado_catalogo.estado_cita_id = cita.estado_cita_id
      WHERE fecha = CURDATE()
      ORDER BY hora ASC
      LIMIT 5
      `
    );

    const [groomingRows] = await pool.query(
      `
      SELECT
        grooming_id,
        nombre_mascota,
        CONCAT_WS(
          ' ',
          tutor_primer_nombre,
          tutor_segundo_nombre,
          tutor_primer_apellido,
          tutor_segundo_apellido
        ) AS nombre_tutor,
        tg.nombre AS tipo_grooming,
        hora,
        estado_catalogo.nombre AS estado
      FROM citas_grooming cg
      INNER JOIN tipos_grooming tg
        ON tg.tipo_grooming_id = cg.tipo_grooming_id
      INNER JOIN estados_grooming estado_catalogo
        ON estado_catalogo.estado_grooming_id = cg.estado_grooming_id
      WHERE fecha = CURDATE()
      ORDER BY hora ASC
      LIMIT 5
      `
    );

    const todayAppointmentsList = appointmentsRows.map((row) => ({
      id: String(row.cita_id),
      petName: row.nombre_mascota,
      tutorName: row.nombre_tutor,
      reason: row.motivo,
      time: formatTime(row.hora),
      status: row.estado,
    }));

    const todayGroomingList = groomingRows.map((row) => ({
      id: String(row.grooming_id),
      petName: row.nombre_mascota,
      tutorName: row.nombre_tutor,
      type: row.tipo_grooming,
      time: formatTime(row.hora),
      status: row.estado,
    }));

    res.json({
      stats: {
        totalPatients,
        todayAppointments,
        todayGrooming,
        upcomingVaccines,
        inventoryProducts,
        lowStock,
        prescriptions,
        // Los reportes se generan bajo demanda y ya no se almacenan.
        aiReports: 0,
      },
      todayAppointments: todayAppointmentsList,
      todayGrooming: todayGroomingList,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar resumen del dashboard',
      error: error.message,
    });
  }
};

module.exports = {
  obtenerResumenDashboard,
};
