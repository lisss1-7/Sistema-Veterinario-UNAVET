const pool = require('../config/db');
const { isTodayOrPast } = require('../utils/inputValidation');

const NEXT_DOSE_EXPRESSION = `
  CASE
    WHEN aplicaciones.dosis_aplicadas >= esquema.dosis_totales
      OR ultima.fecha_aplicacion IS NULL
      OR esquema.intervalo IS NULL
      THEN NULL
    WHEN unidad.meses_por_unidad IS NOT NULL
      AND unidad.meses_por_unidad > 0
      THEN DATE_ADD(
        ultima.fecha_aplicacion,
        INTERVAL ROUND(esquema.intervalo * unidad.meses_por_unidad) MONTH
      )
    WHEN unidad.dias_por_unidad IS NOT NULL
      AND unidad.dias_por_unidad > 0
      THEN DATE_ADD(
        ultima.fecha_aplicacion,
        INTERVAL ROUND(esquema.intervalo * unidad.dias_por_unidad) DAY
      )
    ELSE NULL
  END
`;

const VACUNACION_SELECT = `
  SELECT
    esquema.esquema_id AS vacunacion_id,
    esquema.paciente_id,
    vacuna.nombre AS nombre_vacuna,
    DATE_FORMAT(ultima.fecha_aplicacion, '%Y-%m-%d') AS fecha_aplicacion,
    DATE_FORMAT(${NEXT_DOSE_EXPRESSION}, '%Y-%m-%d') AS proxima_dosis,
    ultima.lote,
    ultima.veterinario_id,
    CONCAT_WS(
      ' ',
      veterinario.primer_nombre,
      veterinario.segundo_nombre,
      veterinario.primer_apellido,
      veterinario.segundo_apellido
    ) AS veterinario,
    estado.nombre AS estado_catalogo,
    esquema.observaciones,
    aplicaciones.dosis_aplicadas,
    esquema.dosis_totales,
    esquema.intervalo,
    unidad.nombre AS unidad_intervalo
  FROM esquemas_vacunacion_paciente esquema
  INNER JOIN vacunas_catalogo vacuna
    ON vacuna.vacuna_id = esquema.vacuna_id
  LEFT JOIN unidades_intervalo unidad
    ON unidad.unidad_intervalo_id = esquema.unidad_intervalo_id
  LEFT JOIN (
    SELECT esquema_id, COUNT(*) AS dosis_aplicadas
    FROM aplicaciones_vacuna
    GROUP BY esquema_id
  ) aplicaciones
    ON aplicaciones.esquema_id = esquema.esquema_id
  LEFT JOIN aplicaciones_vacuna ultima
    ON ultima.aplicacion_id = (
      SELECT aplicacion.aplicacion_id
      FROM aplicaciones_vacuna aplicacion
      WHERE aplicacion.esquema_id = esquema.esquema_id
        AND aplicacion.fecha_aplicacion IS NOT NULL
      ORDER BY aplicacion.numero_dosis DESC, aplicacion.aplicacion_id DESC
      LIMIT 1
    )
  LEFT JOIN veterinarios veterinario
    ON veterinario.veterinario_id = ultima.veterinario_id
  INNER JOIN estados_vacunacion estado
    ON estado.nombre = (
      CASE
        WHEN aplicaciones.dosis_aplicadas >= esquema.dosis_totales
          THEN 'Completado'
        WHEN ${NEXT_DOSE_EXPRESSION} < CURDATE()
          THEN 'Vencida'
        ELSE 'Próxima dosis'
      END
    )
   AND estado.activo = 1
`;

const mapVacunacionToFrontend = (row) => ({
  id: String(row.vacunacion_id),
  patientId: String(row.paciente_id),
  vaccine: row.nombre_vacuna,
  applicationDate: row.fecha_aplicacion || '',
  nextDose: row.proxima_dosis || '',
  lot: row.lote || '',
  veterinarianId: row.veterinario_id
    ? String(row.veterinario_id)
    : '',
  veterinarian: row.veterinario || '',
  status: row.estado_catalogo,
  notes: row.observaciones || '',
  appliedDoses: Number(row.dosis_aplicadas || 0),
  totalDoses: Number(row.dosis_totales || 0),
  interval: row.intervalo || '',
  intervalUnit: row.unidad_intervalo || '',
});

const listarVacunaciones = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${VACUNACION_SELECT}
       ORDER BY ultima.fecha_aplicacion DESC, esquema.esquema_id DESC`
    );
    res.json(rows.map(mapVacunacionToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar vacunaciones',
      error: error.message,
    });
  }
};

const listarVacunacionesPorPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    const [rows] = await pool.query(
      `${VACUNACION_SELECT}
       WHERE esquema.paciente_id = ?
       ORDER BY ultima.fecha_aplicacion DESC, esquema.esquema_id DESC`,
      [pacienteId]
    );
    res.json(rows.map(mapVacunacionToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar vacunaciones',
      error: error.message,
    });
  }
};

const obtenerVacunacionPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `${VACUNACION_SELECT}
       WHERE esquema.esquema_id = ?
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Vacunación no encontrada',
      });
    }
    res.json(mapVacunacionToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener vacunación',
      error: error.message,
    });
  }
};

const crearVacunacion = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      patientId,
      vaccine,
      applicationDate,
      lot,
      veterinarianId,
    } = req.body;

    if (!patientId || !vaccine || !applicationDate || !veterinarianId) {
      return res.status(400).json({
        message:
          'Paciente, vacuna, fecha de aplicación y veterinario son obligatorios',
      });
    }

    const totalDoses = Number(req.body.totalDoses);
    const appliedDoses = Number(req.body.appliedDoses);
    const interval = Number(req.body.interval);
    if (
      !Number.isInteger(totalDoses) ||
      totalDoses < 1 ||
      !Number.isInteger(appliedDoses) ||
      appliedDoses < 1 ||
      appliedDoses > totalDoses ||
      !Number.isInteger(interval) ||
      interval < 1
    ) {
      return res.status(400).json({
        message:
          'Las dosis y el intervalo deben ser enteros mayores que cero',
      });
    }
    if (!isTodayOrPast(applicationDate)) {
      return res.status(400).json({
        message: 'La fecha de aplicación no puede estar en el futuro',
      });
    }

    const [[vaccines], [units], [veterinarians], [patients]] =
      await Promise.all([
        connection.query(
          `SELECT vacuna_id
           FROM vacunas_catalogo
           WHERE nombre = ?
           LIMIT 1`,
          [vaccine]
        ),
        connection.query(
          `SELECT unidad_intervalo_id
           FROM unidades_intervalo
           WHERE nombre = ?
           LIMIT 1`,
          [req.body.intervalUnit]
        ),
        connection.query(
          `SELECT veterinario_id
           FROM veterinarios
           WHERE veterinario_id = ? AND activo = 1
           LIMIT 1`,
          [veterinarianId]
        ),
        connection.query(
          `SELECT paciente_id
           FROM pacientes
           WHERE paciente_id = ? AND activo = 1
           LIMIT 1`,
          [patientId]
        ),
      ]);

    if (
      vaccines.length === 0 ||
      units.length === 0 ||
      veterinarians.length === 0 ||
      patients.length === 0
    ) {
      return res.status(400).json({
        message:
          'Paciente, vacuna, unidad de intervalo o veterinario no pertenecen al catálogo activo',
      });
    }

    await connection.beginTransaction();
    const [schemeResult] = await connection.query(
      `INSERT INTO esquemas_vacunacion_paciente (
         paciente_id,
         vacuna_id,
         dosis_totales,
         intervalo,
         unidad_intervalo_id,
         observaciones,
         creado_por
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        vaccines[0].vacuna_id,
        totalDoses,
        interval,
        units[0].unidad_intervalo_id,
        req.body.notes || req.body.observations || null,
        req.user?.id || null,
      ]
    );

    for (let dose = 1; dose <= appliedDoses; dose += 1) {
      const isCurrentDose = dose === appliedDoses;
      await connection.query(
        `INSERT INTO aplicaciones_vacuna (
           esquema_id,
           numero_dosis,
           fecha_aplicacion,
           fecha_desconocida,
           lote,
           veterinario_id,
           creado_por
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          schemeResult.insertId,
          dose,
          isCurrentDose ? applicationDate : null,
          isCurrentDose ? 0 : 1,
          isCurrentDose ? lot || null : null,
          isCurrentDose ? veterinarianId : null,
          req.user?.id || null,
        ]
      );
    }
    await connection.commit();

    res.status(201).json({
      message: 'Vacuna registrada correctamente',
      id: String(schemeResult.insertId),
    });
  } catch (error) {
    if (connection.connection?._closing !== true) {
      await connection.rollback();
    }
    res.status(500).json({
      message: 'Error al registrar vacuna',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const eliminarVacunacion = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM esquemas_vacunacion_paciente
       WHERE esquema_id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Vacunación no encontrada',
      });
    }
    res.json({
      message: 'Esquema de vacunación eliminado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al eliminar vacuna',
      error: error.message,
    });
  }
};

module.exports = {
  listarVacunaciones,
  listarVacunacionesPorPaciente,
  obtenerVacunacionPorId,
  crearVacunacion,
  eliminarVacunacion,
};
