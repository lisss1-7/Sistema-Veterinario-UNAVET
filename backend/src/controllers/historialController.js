const pool = require('../config/db');

const HISTORIAL_SELECT = `
  SELECT
    historial.historial_id,
    historial.paciente_id,
    historial.cita_id,
    DATE_FORMAT(historial.fecha, '%Y-%m-%d') AS fecha,
    tipo.nombre AS tipo_consulta,
    historial.veterinario_id,
    CONCAT_WS(
      ' ',
      veterinario.primer_nombre,
      veterinario.segundo_nombre,
      veterinario.primer_apellido,
      veterinario.segundo_apellido
    ) AS veterinario,
    historial.motivo_consulta,
    historial.cirugias_previas,
    historial.masas_visibles,
    examen.exam_skin,
    examen.exam_eyes,
    examen.exam_respiratory,
    examen.exam_ears,
    examen.exam_nervous,
    examen.exam_genitourinary,
    examen.exam_nodules,
    examen.exam_pressure,
    historial.diagnostico,
    historial.tratamiento,
    historial.observaciones,
    historial.origen,
    historial.estado_clinico,
    historial.creado_por,
    CONCAT_WS(
      ' ',
      creador.primer_nombre,
      creador.segundo_nombre,
      creador.primer_apellido,
      creador.segundo_apellido
    ) AS creado_por_nombre
  FROM historial_clinico historial
  INNER JOIN tipos_consulta tipo
    ON tipo.tipo_consulta_id = historial.tipo_consulta_id
  LEFT JOIN veterinarios veterinario
    ON veterinario.veterinario_id = historial.veterinario_id
  LEFT JOIN usuarios creador
    ON creador.usuario_id = historial.creado_por
  LEFT JOIN (
    SELECT
      detalle.historial_id,
      MAX(
        CASE WHEN parametro.codigo = 'piel_mucosas'
          THEN estado.nombre END
      ) AS exam_skin,
      MAX(
        CASE WHEN parametro.codigo = 'ojos'
          THEN estado.nombre END
      ) AS exam_eyes,
      MAX(
        CASE WHEN parametro.codigo = 'respiratorio'
          THEN estado.nombre END
      ) AS exam_respiratory,
      MAX(
        CASE WHEN parametro.codigo = 'oidos'
          THEN estado.nombre END
      ) AS exam_ears,
      MAX(
        CASE WHEN parametro.codigo = 'nervioso'
          THEN estado.nombre END
      ) AS exam_nervous,
      MAX(
        CASE WHEN parametro.codigo = 'genitourinario'
          THEN estado.nombre END
      ) AS exam_genitourinary,
      MAX(
        CASE WHEN parametro.codigo = 'nodulos'
          THEN estado.nombre END
      ) AS exam_nodules,
      MAX(
        CASE WHEN parametro.codigo = 'presion'
          THEN estado.nombre END
      ) AS exam_pressure
    FROM historial_examen_fisico detalle
    INNER JOIN parametros_examen_fisico parametro
      ON parametro.parametro_id = detalle.parametro_id
    INNER JOIN estados_examen_fisico estado
      ON estado.estado_examen_id = detalle.estado_examen_id
    GROUP BY detalle.historial_id
  ) examen
    ON examen.historial_id = historial.historial_id
`;

const mapHistorialToFrontend = (row) => ({
  id: String(row.historial_id),
  patientId: String(row.paciente_id),
  appointmentId: row.cita_id ? String(row.cita_id) : undefined,
  date: row.fecha,
  consultationType: row.tipo_consulta,
  veterinarianId: row.veterinario_id
    ? String(row.veterinario_id)
    : '',
  veterinarian: row.veterinario || '',
  reason: row.motivo_consulta,
  previousSurgeries: row.cirugias_previas || '',
  visibleMasses: row.masas_visibles || '',
  examSkin: row.exam_skin || '',
  examEyes: row.exam_eyes || '',
  examRespiratory: row.exam_respiratory || '',
  examEars: row.exam_ears || '',
  examNervous: row.exam_nervous || '',
  examGenitourinary: row.exam_genitourinary || '',
  examNodules: row.exam_nodules || '',
  examPressure: row.exam_pressure || '',
  diagnosis: row.diagnostico || '',
  treatment: row.tratamiento || '',
  observations: row.observaciones || '',
  sourceType: row.origen === 'Cita clínica' ? 'appointment' : 'manual',
  clinicalStatus: row.estado_clinico,
  createdBy: row.creado_por ? String(row.creado_por) : '',
  createdByName: row.creado_por_nombre || '',
});

const normalizePhysicalExam = (body) => ({
  piel_mucosas:
    body.examSkin || body.examMucosa || body.mucosa || null,
  ojos: body.examEyes || body.ojos || null,
  respiratorio:
    body.examRespiratory || body.respiratorio || null,
  oidos: body.examEars || body.oidos || null,
  nervioso:
    body.examNervous || body.examMotility || body.motilidad || null,
  genitourinario:
    body.examGenitourinary ||
    body.examConjunctiva ||
    body.conjuntiva ||
    null,
  nodulos:
    body.examNodules || body.examPalpitations || body.palpitaciones || null,
  presion:
    body.examPressure || body.examPruritus || body.prurito || null,
});

const getConsultationType = async (connection, name) => {
  const [rows] = await connection.query(
    `SELECT tipo_consulta_id
     FROM tipos_consulta
     WHERE nombre = ?
     LIMIT 1`,
    [name]
  );
  return rows[0] || null;
};

const savePhysicalExam = async (connection, historyId, exam) => {
  await connection.query(
    `DELETE FROM historial_examen_fisico
     WHERE historial_id = ?`,
    [historyId]
  );

  for (const [code, state] of Object.entries(exam)) {
    if (!state) continue;
    const [result] = await connection.query(
      `INSERT INTO historial_examen_fisico (
         historial_id,
         parametro_id,
         estado_examen_id
       )
       SELECT ?, parametro.parametro_id, estado.estado_examen_id
       FROM parametros_examen_fisico parametro
       INNER JOIN estados_examen_fisico estado
         ON estado.nombre = ?
       WHERE parametro.codigo = ? AND parametro.activo = 1`,
      [historyId, state, code]
    );
    if (result.affectedRows !== 1) {
      const error = new Error(
        `El valor "${state}" no pertenece al catálogo del examen físico`
      );
      error.code = 'INVALID_EXAM_VALUE';
      throw error;
    }
  }
};

const listarHistorialPorPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    const [rows] = await pool.query(
      `${HISTORIAL_SELECT}
       WHERE historial.paciente_id = ?
       ORDER BY historial.fecha DESC, historial.historial_id DESC`,
      [pacienteId]
    );
    res.json(rows.map(mapHistorialToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar historial clínico',
      error: error.message,
    });
  }
};

const obtenerHistorialPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `${HISTORIAL_SELECT}
       WHERE historial.historial_id = ?
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Registro clínico no encontrado',
      });
    }
    res.json(mapHistorialToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener registro clínico',
      error: error.message,
    });
  }
};

const crearHistorial = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      patientId,
      appointmentId,
      date,
      consultationType,
      veterinarianId,
      reason,
      previousSurgeries,
      visibleMasses,
      diagnosis,
      treatment,
      observations,
      sourceType,
      clinicalStatus,
    } = req.body;

    if (!patientId || !consultationType || !reason || !veterinarianId) {
      return res.status(400).json({
        message:
          'Paciente, tipo de consulta, veterinario y motivo son obligatorios',
      });
    }

    const consultation = await getConsultationType(
      connection,
      consultationType
    );
    if (!consultation) {
      return res.status(400).json({
        message: 'El tipo de consulta no pertenece al catálogo',
      });
    }

    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO historial_clinico (
         paciente_id,
         cita_id,
         fecha,
         tipo_consulta_id,
         veterinario_id,
         motivo_consulta,
         cirugias_previas,
         masas_visibles,
         diagnostico,
         tratamiento,
         observaciones,
         origen,
         estado_clinico,
         creado_por
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        appointmentId || null,
        date || new Date().toISOString().split('T')[0],
        consultation.tipo_consulta_id,
        veterinarianId,
        reason,
        previousSurgeries || null,
        visibleMasses || null,
        diagnosis || null,
        treatment || null,
        observations || null,
        sourceType === 'appointment' ? 'Cita clínica' : 'Manual',
        clinicalStatus || 'Completado',
        req.user?.id || null,
      ]
    );

    await savePhysicalExam(
      connection,
      result.insertId,
      normalizePhysicalExam(req.body)
    );
    await connection.commit();
    res.status(201).json({
      message: 'Registro clínico creado correctamente',
      id: String(result.insertId),
    });
  } catch (error) {
    await connection.rollback();
    const status = error.code === 'INVALID_EXAM_VALUE' ? 400 : 500;
    res.status(status).json({
      message:
        status === 400
          ? error.message
          : 'Error al crear registro clínico',
      error: status === 500 ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

const actualizarHistorial = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      appointmentId,
      date,
      consultationType,
      veterinarianId,
      reason,
      previousSurgeries,
      visibleMasses,
      diagnosis,
      treatment,
      observations,
      sourceType,
      clinicalStatus,
    } = req.body;

    if (!consultationType || !reason || !veterinarianId) {
      return res.status(400).json({
        message: 'Tipo de consulta, veterinario y motivo son obligatorios',
      });
    }

    const consultation = await getConsultationType(
      connection,
      consultationType
    );
    if (!consultation) {
      return res.status(400).json({
        message: 'El tipo de consulta no pertenece al catálogo',
      });
    }

    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE historial_clinico
       SET
         cita_id = ?,
         fecha = ?,
         tipo_consulta_id = ?,
         veterinario_id = ?,
         motivo_consulta = ?,
         cirugias_previas = ?,
         masas_visibles = ?,
         diagnostico = ?,
         tratamiento = ?,
         observaciones = ?,
         origen = ?,
         estado_clinico = ?
       WHERE historial_id = ?`,
      [
        appointmentId || null,
        date || new Date().toISOString().split('T')[0],
        consultation.tipo_consulta_id,
        veterinarianId,
        reason,
        previousSurgeries || null,
        visibleMasses || null,
        diagnosis || null,
        treatment || null,
        observations || null,
        sourceType === 'appointment' ? 'Cita clínica' : 'Manual',
        clinicalStatus || 'Completado',
        id,
      ]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Registro clínico no encontrado',
      });
    }

    await savePhysicalExam(
      connection,
      id,
      normalizePhysicalExam(req.body)
    );
    await connection.commit();
    res.json({
      message: 'Registro clínico actualizado correctamente',
    });
  } catch (error) {
    await connection.rollback();
    const status = error.code === 'INVALID_EXAM_VALUE' ? 400 : 500;
    res.status(status).json({
      message:
        status === 400
          ? error.message
          : 'Error al actualizar registro clínico',
      error: status === 500 ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

const eliminarHistorial = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM historial_clinico
       WHERE historial_id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Registro clínico no encontrado',
      });
    }
    res.json({
      message: 'Registro clínico eliminado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al eliminar registro clínico',
      error: error.message,
    });
  }
};

module.exports = {
  listarHistorialPorPaciente,
  obtenerHistorialPorId,
  crearHistorial,
  actualizarHistorial,
  eliminarHistorial,
};
