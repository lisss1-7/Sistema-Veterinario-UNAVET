const pool = require('../config/db');
const { validarHorarioConfigurado } = require('../utils/scheduleUtils');
const {
  isValidName,
  isValidPhone,
  isTodayOrFuture,
} = require('../utils/inputValidation');
const {
  areValidNameParts,
  buildFullName,
  getTutorNameParts,
} = require('../utils/personName');

const formatTime = (timeValue) => {
  if (!timeValue) return '';

  if (typeof timeValue === 'string') {
    return timeValue.slice(0, 5);
  }

  return String(timeValue).slice(0, 5);
};

const mapCitaToFrontend = (row) => ({
  id: String(row.cita_id),
  patientId: row.paciente_id ? String(row.paciente_id) : '',
  tutorId: row.tutor_id ? String(row.tutor_id) : '',
  tutorFirstName: row.primer_nombre_tutor || '',
  tutorMiddleName: row.segundo_nombre_tutor || '',
  tutorFirstSurname: row.primer_apellido_tutor || '',
  tutorSecondSurname: row.segundo_apellido_tutor || '',
  tutorName: row.nombre_tutor,
  tutorPhone: row.telefono_tutor,
  petName: row.nombre_mascota,
  breed: row.raza,
  animalSize: row.tamano_mascota,
  date: row.fecha,
  time: formatTime(row.hora),
  reason: row.motivo,
  status: row.estado,
  notes: row.notas,
});

const obtenerTutorPorPaciente = async (connection, pacienteId) => {
  const [rows] = await connection.query(
    `
    SELECT
      p.paciente_id,
      p.tutor_id,
      p.nombre AS nombre_mascota,
      r.nombre AS raza,
      t.primer_nombre AS primer_nombre_tutor,
      t.segundo_nombre AS segundo_nombre_tutor,
      t.primer_apellido AS primer_apellido_tutor,
      t.segundo_apellido AS segundo_apellido_tutor,
      CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
        t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
      t.telefono AS telefono_tutor
    FROM pacientes p
    INNER JOIN tutores t ON p.tutor_id = t.tutor_id
    LEFT JOIN razas r ON p.raza_id = r.raza_id
    WHERE p.paciente_id = ? AND p.activo = 1
    LIMIT 1
    `,
    [pacienteId]
  );

  return rows[0] || null;
};

const obtenerOCrearTutor = async (connection, data) => {
  const {
    tutorFirstName,
    tutorMiddleName,
    tutorFirstSurname,
    tutorSecondSurname,
    tutorPhone,
  } = data;

  if (!tutorFirstName || !tutorFirstSurname || !tutorPhone) return null;

  const [rows] = await connection.query(
    `
    SELECT tutor_id
    FROM tutores
    WHERE telefono = ?
      AND primer_nombre = ?
      AND primer_apellido = ?
    LIMIT 1
    `,
    [tutorPhone, tutorFirstName, tutorFirstSurname]
  );

  if (rows.length > 0) {
    await connection.query(
      `
      UPDATE tutores
      SET primer_nombre = ?, segundo_nombre = ?,
          primer_apellido = ?, segundo_apellido = ?, activo = 1
      WHERE tutor_id = ?
      `,
      [
        tutorFirstName,
        tutorMiddleName || null,
        tutorFirstSurname,
        tutorSecondSurname || null,
        rows[0].tutor_id,
      ]
    );

    return rows[0].tutor_id;
  }

  const [result] = await connection.query(
    `
    INSERT INTO tutores (
      primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      telefono, activo
    )
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [
      tutorFirstName,
      tutorMiddleName || null,
      tutorFirstSurname,
      tutorSecondSurname || null,
      tutorPhone,
    ]
  );

  return result.insertId;
};

const obtenerTamanoAnimal = async (connection, name) => {
  if (!name) return null;
  const [rows] = await connection.query(
    `
    SELECT tamano_animal_id
    FROM tamanos_animales
    WHERE nombre = ?
    LIMIT 1
    `,
    [name]
  );
  return rows[0] || null;
};

const obtenerEstadoCita = async (connection, name) => {
  if (!name) return null;
  const [rows] = await connection.query(
    `
    SELECT estado_cita_id, nombre, es_cancelado
    FROM estados_cita
    WHERE nombre = ?
    LIMIT 1
    `,
    [name]
  );
  return rows[0] || null;
};

const validarHorarioDisponible = async (connection, date, time, citaId = null) => {
  const params = [date, time];

  let query = `
    SELECT cita_id
    FROM citas_clinicas
    WHERE fecha = ?
      AND hora = ?
      AND estado_cita_id NOT IN (
        SELECT estado_cita_id
        FROM estados_cita
        WHERE es_cancelado = 1
      )
  `;

  if (citaId) {
    query += ' AND cita_id <> ?';
    params.push(citaId);
  }

  query += ' LIMIT 1';

  const [rows] = await connection.query(query, params);

  return rows.length === 0;
};

const sincronizarHistorialDesdeCita = async (connection, citaId, cita) => {
  const isCancelled =
    String(cita.estado || '').trim().toLocaleLowerCase('es') === 'cancelada';

  if (!cita.paciente_id || isCancelled) {
    await connection.query(
      'DELETE FROM historial_clinico WHERE cita_id = ? AND origen = ? AND estado_clinico = ?',
      [citaId, 'Cita clínica', 'Pendiente']
    );

    return;
  }

  const [existingRows] = await connection.query(
    `
    SELECT historial_id, origen, estado_clinico
    FROM historial_clinico
    WHERE cita_id = ?
    LIMIT 1
    `,
    [citaId]
  );

  const observaciones = `Cita programada para las ${formatTime(cita.hora)}. Estado actual: ${cita.estado || 'Pendiente'}.`;

  if (existingRows.length > 0) {
    const existing = existingRows[0];

    if (
      existing.origen !== 'Cita clínica' ||
      existing.estado_clinico !== 'Pendiente'
    ) {
      return;
    }

    await connection.query(
      `
      UPDATE historial_clinico
      SET
        paciente_id = ?,
        fecha = ?,
        motivo_consulta = ?,
        observaciones = ?,
        tipo_consulta_id = (
          SELECT tipo_consulta_id
          FROM tipos_consulta
          WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?))
          LIMIT 1
        )
      WHERE historial_id = ?
        AND origen = ?
        AND estado_clinico = ?
      `,
      [
        cita.paciente_id,
        cita.fecha,
        cita.motivo || 'Cita clínica registrada desde el módulo de citas.',
        observaciones,
        'Cita clínica programada',
        existing.historial_id,
        'Cita clínica',
        'Pendiente',
      ]
    );

    return;
  }

  await connection.query(
    `
    INSERT INTO historial_clinico (
      paciente_id,
      cita_id,
      fecha,
      tipo_consulta_id,
      veterinario_id,
      motivo_consulta,
      diagnostico,
      tratamiento,
      observaciones,
      origen,
      estado_clinico,
      creado_por
    )
    VALUES (
      ?, ?, ?,
      (SELECT tipo_consulta_id
       FROM tipos_consulta
       WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?))
       LIMIT 1),
      ?, ?, ?, ?, ?, ?, ?, ?
    )
    `,
    [
      cita.paciente_id,
      citaId,
      cita.fecha,
      'Cita clínica programada',
      null,
      cita.motivo || 'Cita clínica registrada desde el módulo de citas.',
      null,
      null,
      observaciones,
      'Cita clínica',
      'Pendiente',
      cita.creado_por || null,
    ]
  );

};

const listarCitas = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.cita_id,
        c.paciente_id,
        c.tutor_id,
        c.nombre_mascota,
        CONCAT_WS(
          ' ',
          c.tutor_primer_nombre,
          c.tutor_segundo_nombre,
          c.tutor_primer_apellido,
          c.tutor_segundo_apellido
        ) AS nombre_tutor,
        c.telefono_tutor,
        c.tutor_primer_nombre AS primer_nombre_tutor,
        c.tutor_segundo_nombre AS segundo_nombre_tutor,
        c.tutor_primer_apellido AS primer_apellido_tutor,
        c.tutor_segundo_apellido AS segundo_apellido_tutor,
        c.raza,
        tamano.nombre AS tamano_mascota,
        DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
        c.hora,
        c.motivo,
        estado.nombre AS estado,
        c.notas
      FROM citas_clinicas c
      INNER JOIN estados_cita estado
        ON estado.estado_cita_id = c.estado_cita_id
      LEFT JOIN tamanos_animales tamano
        ON tamano.tamano_animal_id = c.tamano_animal_id
      ORDER BY c.fecha DESC, c.hora DESC, c.cita_id DESC
      `
    );

    res.json(rows.map(mapCitaToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar citas',
      error: error.message,
    });
  }
};

const obtenerCitaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        c.cita_id,
        c.paciente_id,
        c.tutor_id,
        c.nombre_mascota,
        CONCAT_WS(
          ' ',
          c.tutor_primer_nombre,
          c.tutor_segundo_nombre,
          c.tutor_primer_apellido,
          c.tutor_segundo_apellido
        ) AS nombre_tutor,
        c.telefono_tutor,
        c.tutor_primer_nombre AS primer_nombre_tutor,
        c.tutor_segundo_nombre AS segundo_nombre_tutor,
        c.tutor_primer_apellido AS primer_apellido_tutor,
        c.tutor_segundo_apellido AS segundo_apellido_tutor,
        c.raza,
        tamano.nombre AS tamano_mascota,
        DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
        c.hora,
        c.motivo,
        estado.nombre AS estado,
        c.notas
      FROM citas_clinicas c
      INNER JOIN estados_cita estado
        ON estado.estado_cita_id = c.estado_cita_id
      LEFT JOIN tamanos_animales tamano
        ON tamano.tamano_animal_id = c.tamano_animal_id
      WHERE c.cita_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Cita no encontrada',
      });
    }

    res.json(mapCitaToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener cita',
      error: error.message,
    });
  }
};

const crearCita = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      patientId,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      petName,
      breed,
      animalSize,
      date,
      time,
      reason,
      notes,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);
    const tutorName = buildFullName(tutorNameParts);

    if (
      !areValidNameParts(tutorNameParts) || !tutorPhone ||
      !petName || !date || !time || !reason
    ) {
      return res.status(400).json({
        message: 'Tutor, teléfono, mascota, fecha, hora y motivo son obligatorios',
      });
    }

    await connection.beginTransaction();

    if (!(await validarHorarioConfigurado({
      connection,
      moduleCode: 'appointments',
      date,
      time,
    }))) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El horario seleccionado no está habilitado en la configuración',
      });
    }

    if (!isValidName(petName)) {
      return res.status(400).json({
        message: 'Los nombres solo pueden contener letras y deben tener entre 2 y 80 caracteres',
      });
    }

    if (!isValidPhone(tutorPhone)) {
      return res.status(400).json({
        message: 'El teléfono debe contener únicamente entre 8 y 15 dígitos',
      });
    }

    if (!isTodayOrFuture(date)) {
      return res.status(400).json({
        message: 'La fecha de la cita no puede estar en el pasado',
      });
    }

    const disponible = await validarHorarioDisponible(connection, date, time);

    if (!disponible) {
      await connection.rollback();

      return res.status(409).json({
        message: 'Ya existe una cita en ese horario',
      });
    }

    let pacienteId = patientId || null;
    let tutorId = null;
    let nombreMascota = petName;
    let nombreTutor = tutorName;
    let telefonoTutor = tutorPhone;
    let raza = breed || null;

    if (pacienteId) {
      const paciente = await obtenerTutorPorPaciente(connection, pacienteId);

      if (!paciente) {
        await connection.rollback();

        return res.status(404).json({
          message: 'Paciente vinculado no encontrado',
        });
      }

      tutorId = paciente.tutor_id;
      nombreMascota = petName || paciente.nombre_mascota;
      nombreTutor = tutorName || paciente.nombre_tutor;
      telefonoTutor = tutorPhone || paciente.telefono_tutor;
      raza = breed || paciente.raza;
    } else {
      tutorId = await obtenerOCrearTutor(connection, {
        tutorFirstName,
        tutorMiddleName,
        tutorFirstSurname,
        tutorSecondSurname,
        tutorPhone,
      });
    }

    const sizeCatalog = await obtenerTamanoAnimal(connection, animalSize);
    if (animalSize && !sizeCatalog) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El tamaño seleccionado no pertenece al catálogo',
      });
    }

    const [initialStatuses] = await connection.query(
      'SELECT estado_cita_id, nombre FROM estados_cita WHERE es_inicial = 1 LIMIT 1'
    );
    if (initialStatuses.length === 0) {
      throw new Error('No existe un estado inicial configurado para las citas');
    }
    const initialStatus = initialStatuses[0].nombre;

    const [result] = await connection.query(
      `
      INSERT INTO citas_clinicas (
        paciente_id,
        tutor_id,
        nombre_mascota,
        tutor_primer_nombre,
        tutor_segundo_nombre,
        tutor_primer_apellido,
        tutor_segundo_apellido,
        telefono_tutor,
        raza,
        tamano_animal_id,
        fecha,
        hora,
        motivo,
        estado_cita_id,
        notas,
        creado_por
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        pacienteId,
        tutorId,
        nombreMascota,
        tutorNameParts.firstName,
        tutorNameParts.middleName || null,
        tutorNameParts.firstSurname,
        tutorNameParts.secondSurname || null,
        telefonoTutor,
        raza,
        sizeCatalog?.tamano_animal_id || null,
        date,
        time,
        reason,
        initialStatuses[0].estado_cita_id,
        notes || null,
        req.user?.id || null,
      ]
    );

    const citaId = result.insertId;
    await sincronizarHistorialDesdeCita(connection, citaId, {
      paciente_id: pacienteId,
      fecha: date,
      hora: time,
      motivo: reason,
      estado: initialStatus,
      creado_por: req.user?.id || null,
    });

    await connection.commit();

    res.status(201).json({
      message: pacienteId
        ? 'Cita creada correctamente y agregada al historial clínico del paciente'
        : 'Cita creada correctamente',
      id: String(citaId),
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al crear cita',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const actualizarCita = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const {
      patientId,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      petName,
      breed,
      animalSize,
      date,
      time,
      reason,
      status,
      notes,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);
    const tutorName = buildFullName(tutorNameParts);

    if (
      !areValidNameParts(tutorNameParts) || !tutorPhone ||
      !petName || !date || !time || !reason
    ) {
      return res.status(400).json({
        message: 'Tutor, teléfono, mascota, fecha, hora y motivo son obligatorios',
      });
    }

    if (!isValidName(petName)) {
      return res.status(400).json({
        message: 'Los nombres solo pueden contener letras y deben tener entre 2 y 80 caracteres',
      });
    }

    if (!isValidPhone(tutorPhone)) {
      return res.status(400).json({
        message: 'El teléfono debe contener únicamente entre 8 y 15 dígitos',
      });
    }

    if (!isTodayOrFuture(date)) {
      return res.status(400).json({
        message: 'La fecha de la cita no puede estar en el pasado',
      });
    }

    await connection.beginTransaction();

    if (!(await validarHorarioConfigurado({
      connection,
      moduleCode: 'appointments',
      date,
      time,
    }))) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El horario seleccionado no está habilitado en la configuración',
      });
    }

    const [existing] = await connection.query(
      `
      SELECT cita.cita_id, cita.estado_cita_id, estado.nombre AS estado
      FROM citas_clinicas cita
      INNER JOIN estados_cita estado
        ON estado.estado_cita_id = cita.estado_cita_id
      WHERE cita.cita_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Cita no encontrada',
      });
    }

    const disponible = await validarHorarioDisponible(connection, date, time, id);

    if (!disponible) {
      await connection.rollback();

      return res.status(409).json({
        message: 'Ya existe una cita en ese horario',
      });
    }

    let pacienteId = patientId || null;
    let tutorId = null;
    let nombreMascota = petName;
    let nombreTutor = tutorName;
    let telefonoTutor = tutorPhone;
    let raza = breed || null;

    if (pacienteId) {
      const paciente = await obtenerTutorPorPaciente(connection, pacienteId);

      if (!paciente) {
        await connection.rollback();

        return res.status(404).json({
          message: 'Paciente vinculado no encontrado',
        });
      }

      tutorId = paciente.tutor_id;
      nombreMascota = petName || paciente.nombre_mascota;
      nombreTutor = tutorName || paciente.nombre_tutor;
      telefonoTutor = tutorPhone || paciente.telefono_tutor;
      raza = breed || paciente.raza;
    } else {
      tutorId = await obtenerOCrearTutor(connection, {
        tutorFirstName,
        tutorMiddleName,
        tutorFirstSurname,
        tutorSecondSurname,
        tutorPhone,
      });
    }

    const statusCatalog = status
      ? await obtenerEstadoCita(connection, status)
      : {
          estado_cita_id: existing[0].estado_cita_id,
          nombre: existing[0].estado,
        };
    const sizeCatalog = await obtenerTamanoAnimal(connection, animalSize);

    if (!statusCatalog || (animalSize && !sizeCatalog)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El estado o el tamaño seleccionado no pertenece al catálogo',
      });
    }
    const finalStatus = statusCatalog.nombre;

    await connection.query(
      `
      UPDATE citas_clinicas
      SET
        paciente_id = ?,
        tutor_id = ?,
        nombre_mascota = ?,
        tutor_primer_nombre = ?,
        tutor_segundo_nombre = ?,
        tutor_primer_apellido = ?,
        tutor_segundo_apellido = ?,
        telefono_tutor = ?,
        raza = ?,
        tamano_animal_id = ?,
        fecha = ?,
        hora = ?,
        motivo = ?,
        estado_cita_id = ?,
        notas = ?
      WHERE cita_id = ?
      `,
      [
        pacienteId,
        tutorId,
        nombreMascota,
        tutorNameParts.firstName,
        tutorNameParts.middleName || null,
        tutorNameParts.firstSurname,
        tutorNameParts.secondSurname || null,
        telefonoTutor,
        raza,
        sizeCatalog?.tamano_animal_id || null,
        date,
        time,
        reason,
        statusCatalog.estado_cita_id,
        notes || null,
        id,
      ]
    );

    await sincronizarHistorialDesdeCita(connection, id, {
      paciente_id: pacienteId,
      fecha: date,
      hora: time,
      motivo: reason,
      estado: finalStatus,
      creado_por: req.user?.id || null,
    });

    await connection.commit();

    res.json({
      message: pacienteId
        ? 'Cita actualizada correctamente y sincronizada con el historial clínico'
        : 'Cita actualizada correctamente',
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al actualizar cita',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const cambiarEstadoCita = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { status } = req.body;

    const [validStatuses] = await pool.query(
      'SELECT estado_cita_id FROM estados_cita WHERE nombre = ? LIMIT 1',
      [status]
    );

    if (validStatuses.length === 0) {
      return res.status(400).json({
        message: 'Estado de cita inválido',
      });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        cita_id,
        paciente_id,
        DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
        hora,
        motivo
      FROM citas_clinicas
      WHERE cita_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Cita no encontrada',
      });
    }

    await connection.query(
      'UPDATE citas_clinicas SET estado_cita_id = ? WHERE cita_id = ?',
      [validStatuses[0].estado_cita_id, id]
    );

    await sincronizarHistorialDesdeCita(connection, id, {
      paciente_id: rows[0].paciente_id,
      fecha: rows[0].fecha,
      hora: rows[0].hora,
      motivo: rows[0].motivo,
      estado: status,
      creado_por: req.user?.id || null,
    });

    await connection.commit();

    res.json({
      message: 'Estado de cita actualizado correctamente',
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al actualizar estado de cita',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const eliminarCita = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    await connection.query(
      'DELETE FROM historial_clinico WHERE cita_id = ? AND origen = ? AND estado_clinico = ?',
      [id, 'Cita clínica', 'Pendiente']
    );

    const [result] = await connection.query(
      'DELETE FROM citas_clinicas WHERE cita_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Cita no encontrada',
      });
    }

    await connection.commit();

    res.json({
      message: 'Cita eliminada correctamente',
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al eliminar cita',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  listarCitas,
  obtenerCitaPorId,
  crearCita,
  actualizarCita,
  cambiarEstadoCita,
  eliminarCita,
};
