const pool = require('../config/db');

const formatTime = (timeValue) => {
  if (!timeValue) return '';

  if (typeof timeValue === 'string') {
    return timeValue.slice(0, 5);
  }

  return String(timeValue).slice(0, 5);
};

const formatDateForDisplay = (dateValue) => {
  const normalized = String(dateValue || '').trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  return isoMatch
    ? `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
    : normalized;
};

const buildUpcomingVaccinationReminders = (rows = []) => {
  return rows
    .filter((row) => row && row.proxima_dosis)
    .filter((row) => {
      const days = Number(row.dias_restantes || 0);
      return days >= 0 && days <= 14;
    })
    .slice(0, 3)
    .map((row) => {
      const days = Number(row.dias_restantes || 0);
      const relativeText =
        days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;

      const patientLabel = row.nombre_mascota || 'Paciente sin nombre';
      const tutorLabel = row.nombre_tutor ? ` · Tutor: ${row.nombre_tutor}` : '';
      const nextDoseDate = formatDateForDisplay(row.proxima_dosis);

      return {
        patientId: row.paciente_id ? String(row.paciente_id) : '',
        title: patientLabel,
        description: `${row.nombre_vacuna || 'Vacuna'} · Próxima dosis ${relativeText} (${nextDoseDate})${tutorLabel}`,
        tag: 'Vacuna',
        tone: 'amber',
      };
    });
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
      getCount('SELECT COUNT(*) AS total FROM paciente WHERE activo = 1'),
      getCount('SELECT COUNT(*) AS total FROM cita_clinica WHERE fecha = CURDATE()'),
      getCount('SELECT COUNT(*) AS total FROM cita_grooming WHERE fecha = CURDATE()'),
      getCount(`
        SELECT COUNT(*) AS total
        FROM esquema_vacunacion_paciente esquema
        LEFT JOIN unidad_intervalo unidad
          ON unidad.unidad_intervalo_id = esquema.unidad_intervalo_id
        LEFT JOIN (
          SELECT
            esquema_id,
            COUNT(*) AS dosis_aplicadas,
            MAX(fecha_aplicacion) AS ultima_aplicacion
          FROM aplicacion_vacuna
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
        'SELECT COUNT(*) AS total FROM producto_inventario WHERE activo = 1'
      ),
      getCount(`
        SELECT COUNT(*) AS total
        FROM producto_inventario producto
        LEFT JOIN (
          SELECT producto_id, SUM(stock) AS stock_actual
          FROM lote_producto
          GROUP BY producto_id
        ) lotes ON lotes.producto_id = producto.producto_id
        WHERE producto.activo = 1
          AND COALESCE(lotes.stock_actual, 0) <= producto.stock_minimo
      `),
      getCount(`
        SELECT COUNT(*) AS total
        FROM receta receta
        INNER JOIN estado_receta estado
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
      FROM cita_clinica cita
      INNER JOIN estado_cita estado_catalogo
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
      FROM cita_grooming cg
      INNER JOIN tipo_grooming tg
        ON tg.tipo_grooming_id = cg.tipo_grooming_id
      INNER JOIN estado_grooming estado_catalogo
        ON estado_catalogo.estado_grooming_id = cg.estado_grooming_id
      WHERE fecha = CURDATE()
      ORDER BY hora ASC
      LIMIT 5
      `
    );

    const [upcomingVaccinationRows] = await pool.query(
      `
      SELECT * FROM (
        SELECT
          p.paciente_id,
          p.nombre AS nombre_mascota,
          CONCAT_WS(
            ' ',
            t.primer_nombre,
            t.segundo_nombre,
            t.primer_apellido,
            t.segundo_apellido
          ) AS nombre_tutor,
          vc.nombre AS nombre_vacuna,
          DATE_FORMAT(
            CASE
              WHEN COALESCE(aplicaciones.dosis_aplicadas, 0) >= esquema.dosis_totales
                OR aplicaciones.ultima_fecha IS NULL
                OR esquema.intervalo IS NULL
                THEN NULL
              WHEN unidad.meses_por_unidad IS NOT NULL
                AND unidad.meses_por_unidad > 0
                THEN DATE_ADD(
                  aplicaciones.ultima_fecha,
                  INTERVAL ROUND(esquema.intervalo * unidad.meses_por_unidad) MONTH
                )
              WHEN unidad.dias_por_unidad IS NOT NULL
                AND unidad.dias_por_unidad > 0
                THEN DATE_ADD(
                  aplicaciones.ultima_fecha,
                  INTERVAL ROUND(esquema.intervalo * unidad.dias_por_unidad) DAY
                )
              ELSE NULL
            END,
            '%Y-%m-%d'
          ) AS proxima_dosis,
          DATEDIFF(
            CASE
              WHEN COALESCE(aplicaciones.dosis_aplicadas, 0) >= esquema.dosis_totales
                OR aplicaciones.ultima_fecha IS NULL
                OR esquema.intervalo IS NULL
                THEN NULL
              WHEN unidad.meses_por_unidad IS NOT NULL
                AND unidad.meses_por_unidad > 0
                THEN DATE_ADD(
                  aplicaciones.ultima_fecha,
                  INTERVAL ROUND(esquema.intervalo * unidad.meses_por_unidad) MONTH
                )
              WHEN unidad.dias_por_unidad IS NOT NULL
                AND unidad.dias_por_unidad > 0
                THEN DATE_ADD(
                  aplicaciones.ultima_fecha,
                  INTERVAL ROUND(esquema.intervalo * unidad.dias_por_unidad) DAY
                )
              ELSE NULL
            END,
            CURDATE()
          ) AS dias_restantes
        FROM esquema_vacunacion_paciente esquema
        INNER JOIN paciente p
          ON p.paciente_id = esquema.paciente_id
        INNER JOIN tutor t
          ON t.tutor_id = p.tutor_id
        INNER JOIN vacuna_catalogo vc
          ON vc.vacuna_id = esquema.vacuna_id
        LEFT JOIN unidad_intervalo unidad
          ON unidad.unidad_intervalo_id = esquema.unidad_intervalo_id
        LEFT JOIN (
          SELECT
            esquema_id,
            COUNT(*) AS dosis_aplicadas,
            MAX(fecha_aplicacion) AS ultima_fecha
          FROM aplicacion_vacuna
          GROUP BY esquema_id
        ) aplicaciones
          ON aplicaciones.esquema_id = esquema.esquema_id
      ) AS vacuna_proxima
      WHERE vacuna_proxima.proxima_dosis IS NOT NULL
        AND vacuna_proxima.proxima_dosis >= CURDATE()
        AND vacuna_proxima.proxima_dosis <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
      ORDER BY vacuna_proxima.proxima_dosis ASC
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

    const upcomingVaccinationsList = buildUpcomingVaccinationReminders(
      upcomingVaccinationRows
    );

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
      upcomingVaccinations: upcomingVaccinationsList,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar resumen del dashboard',
      error: error.message,
    });
  }
};

module.exports = {
  buildUpcomingVaccinationReminders,
  obtenerResumenDashboard,
};
