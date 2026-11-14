const pool = require('../config/db');
const { sincronizarHistorialDesdeGrooming } = require('../utils/groomingHistory');
const { validarHorarioConfigurado } = require('../utils/scheduleUtils');
const transport = require('../utils/groomingTransport');
const {
  areValidNameParts,
  buildFullName,
  getTutorNameParts,
} = require('../utils/personName');
const {
  isTodayOrFuture,
  isValidAgeSpacing,
} = require('../utils/inputValidation');

const formatTime = (timeValue) => {
  if (!timeValue) return '';

  if (typeof timeValue === 'string') {
    return timeValue.slice(0, 5);
  }

  return String(timeValue).slice(0, 5);
};

const obtenerTipoGrooming = async (connection, name) => {
  const [rows] = await connection.query(
    `
    SELECT tipo_grooming_id, nombre, requiere_transporte
    FROM tipo_grooming
    WHERE nombre = ?
    LIMIT 1
    `,
    [name]
  );
  return rows[0] || null;
};

const obtenerTamanoAnimal = async (connection, name) => {
  if (!name) return null;
  const [rows] = await connection.query(
    `
    SELECT tamano_animal_id
    FROM tamano_animal
    WHERE nombre = ?
    LIMIT 1
    `,
    [name]
  );
  return rows[0] || null;
};

const obtenerEspeciePorNombre = async (connection, name) => {
  if (!name) return null;

  const [rows] = await connection.query(
    `SELECT especie_id
     FROM especie
     WHERE LOWER(TRIM(nombre)) = LOWER(?) AND activo = 1
     LIMIT 1`,
    [String(name).trim()]
  );

  return rows[0] || null;
};

const registrarRazaEnCatalogo = async (connection, especieId, name) => {
  const breedName = String(name || '').trim();
  if (!breedName) return null;

  const [rows] = await connection.query(
    `SELECT raza_id, activo
     FROM raza
     WHERE especie_id = ? AND LOWER(TRIM(nombre)) = LOWER(?)
     LIMIT 1`,
    [especieId, breedName]
  );

  if (rows.length > 0) {
    if (!rows[0].activo) {
      await connection.query(
        'UPDATE raza SET nombre = ?, activo = 1 WHERE raza_id = ?',
        [breedName, rows[0].raza_id]
      );
    }
    return rows[0].raza_id;
  }

  const [result] = await connection.query(
    'INSERT INTO raza (especie_id, nombre, activo) VALUES (?, ?, 1)',
    [especieId, breedName]
  );

  return result.insertId;
};

const mapGroomingToFrontend = (row) => {
  return {
    id: String(row.grooming_id),
    patientId: row.paciente_id ? String(row.paciente_id) : '',
    tutorId: row.tutor_id ? String(row.tutor_id) : '',
    type: row.tipo_configurado,
    petName: row.nombre_mascota,
    time: formatTime(row.hora),
    breed: row.raza || '',
    animalSize: row.tamano_mascota || '',
    age: row.edad || '',
    tutorFirstName: row.primer_nombre_tutor || '',
    tutorMiddleName: row.segundo_nombre_tutor || '',
    tutorFirstSurname: row.primer_apellido_tutor || '',
    tutorSecondSurname: row.segundo_apellido_tutor || '',
    tutorName: row.nombre_tutor,
    tutorPhone: row.telefono_tutor,
    groomingCost: Number(row.costo_grooming || 0),
    transportCost: Number(row.costo_transporte || 0),
    address: row.direccion_recogida || '',
    accessCode: row.codigo_acceso || '',
    status: row.estado,
    observations: row.observaciones || '',
    date: row.fecha,
  };
};

const obtenerTutorPorPaciente = async (connection, pacienteId) => {
  const [rows] = await connection.query(
    `
    SELECT
      p.paciente_id,
      p.tutor_id,
      p.nombre AS nombre_mascota,
      p.edad,
      r.nombre AS raza,
      t.primer_nombre AS primer_nombre_tutor,
      t.segundo_nombre AS segundo_nombre_tutor,
      t.primer_apellido AS primer_apellido_tutor,
      t.segundo_apellido AS segundo_apellido_tutor,
      CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
        t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
      t.telefono AS telefono_tutor
    FROM paciente p
    INNER JOIN tutor t ON p.tutor_id = t.tutor_id
    LEFT JOIN raza r ON p.raza_id = r.raza_id
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
    FROM tutor
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
      UPDATE tutor
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
    INSERT INTO tutor (
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

const validarLimiteTransporte = async (
  connection,
  date,
  groomingTypeId,
  groomingId = null
) => {
  const params = [date, groomingTypeId];

  let query = `
    SELECT COUNT(*) AS total
    FROM cita_grooming
    WHERE fecha = ?
      AND tipo_grooming_id = ?
      AND estado_grooming_id NOT IN (
        SELECT estado_grooming_id
        FROM estado_grooming
        WHERE es_cancelado = 1
      )
  `;

  if (groomingId) {
    query += ' AND grooming_id <> ?';
    params.push(groomingId);
  }

  const [rows] = await connection.query(query, params);
  const [capacityRows] = await connection.query(
    `
    SELECT h.capacidad_diaria
    FROM horario_atencion h
    INNER JOIN modulo_sistema m ON m.modulo_id = h.modulo_id
    WHERE m.codigo = 'grooming'
      AND h.dia_semana = DAYOFWEEK(?) - 1
      AND h.activo = 1
      AND h.capacidad_diaria IS NOT NULL
    LIMIT 1
    `,
    [date]
  );
  const capacity = Number(capacityRows[0]?.capacidad_diaria || 0);
  return capacity > 0 && Number(rows[0].total || 0) < capacity;
};

const listarGrooming = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        grooming_id,
        paciente_id,
        cita_grooming.tutor_id,
        nombre_mascota,
        CONCAT_WS(
          ' ',
          tutor_primer_nombre,
          tutor_segundo_nombre,
          tutor_primer_apellido,
          tutor_segundo_apellido
        ) AS nombre_tutor,
        telefono_tutor,
        tutor_primer_nombre AS primer_nombre_tutor,
        tutor_segundo_nombre AS segundo_nombre_tutor,
        tutor_primer_apellido AS primer_apellido_tutor,
        tutor_segundo_apellido AS segundo_apellido_tutor,
        raza,
        tamano.nombre AS tamano_mascota,
        tg.nombre AS tipo_configurado,
        direccion_recogida,
        DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
        hora,
        estado_catalogo.nombre AS estado,
        observaciones,
        edad,
        codigo_acceso,
        costo_grooming,
        costo_transporte
      FROM cita_grooming
      INNER JOIN tipo_grooming tg
        ON tg.tipo_grooming_id = cita_grooming.tipo_grooming_id
      INNER JOIN estado_grooming estado_catalogo
        ON estado_catalogo.estado_grooming_id =
          cita_grooming.estado_grooming_id
      LEFT JOIN tamano_animal tamano
        ON tamano.tamano_animal_id = cita_grooming.tamano_animal_id
      ORDER BY fecha DESC, hora DESC, grooming_id DESC
      `
    );

    res.json(await transport.enrichAppointments(pool, rows.map(mapGroomingToFrontend)));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar citas de grooming',
      error: error.message,
    });
  }
};

const obtenerGroomingPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        grooming_id,
        paciente_id,
        cita_grooming.tutor_id,
        nombre_mascota,
        CONCAT_WS(
          ' ',
          tutor_primer_nombre,
          tutor_segundo_nombre,
          tutor_primer_apellido,
          tutor_segundo_apellido
        ) AS nombre_tutor,
        telefono_tutor,
        tutor_primer_nombre AS primer_nombre_tutor,
        tutor_segundo_nombre AS segundo_nombre_tutor,
        tutor_primer_apellido AS primer_apellido_tutor,
        tutor_segundo_apellido AS segundo_apellido_tutor,
        raza,
        tamano.nombre AS tamano_mascota,
        tg.nombre AS tipo_configurado,
        direccion_recogida,
        DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
        hora,
        estado_catalogo.nombre AS estado,
        observaciones,
        edad,
        codigo_acceso,
        costo_grooming,
        costo_transporte
      FROM cita_grooming
      INNER JOIN tipo_grooming tg
        ON tg.tipo_grooming_id = cita_grooming.tipo_grooming_id
      INNER JOIN estado_grooming estado_catalogo
        ON estado_catalogo.estado_grooming_id =
          cita_grooming.estado_grooming_id
      LEFT JOIN tamano_animal tamano
        ON tamano.tamano_animal_id = cita_grooming.tamano_animal_id
      WHERE grooming_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Cita de grooming no encontrada',
      });
    }

    res.json((await transport.enrichAppointments(pool, [mapGroomingToFrontend(rows[0])]))[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener cita de grooming',
      error: error.message,
    });
  }
};

const crearGrooming = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      patientId,
      type,
      petName,
      breed,
      species,
      age,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      groomingCost,
      transportCost,
      address,
      accessCode,
      observations,
      date,
      time,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);
    const tutorName = buildFullName(tutorNameParts);

    if (
      !type || !petName || !req.body.animalSize ||
      (!patientId && !String(age || '').trim()) ||
      !areValidNameParts(tutorNameParts) ||
      !tutorPhone || !date || !time || groomingCost === undefined
    ) {
      return res.status(400).json({
        message: 'Tipo, mascota, tamaño, tutor, teléfono, fecha, hora y costo son obligatorios',
      });
    }

    if (!isTodayOrFuture(date)) {
      return res.status(400).json({
        code: 'INVALID_DATE',
        message: 'La fecha debe ser válida y no puede ser anterior al día actual de Guatemala',
      });
    }

    if (String(age || '').trim().length > 50) {
      return res.status(400).json({
        message: 'La edad no puede exceder 50 caracteres',
      });
    }

    if (!isValidAgeSpacing(age)) {
      return res.status(400).json({
        message: 'La edad debe separar el número de la unidad, por ejemplo: 2 años',
      });
    }

    await connection.beginTransaction();
    const additionalPets = req.body.additionalPets || [];
    if (!Array.isArray(additionalPets) || additionalPets.some(pet => !pet || typeof pet !== 'object') || additionalPets.length > 3 || (additionalPets.length && !patientId)) {
      transport.fail('Seleccione una mascota registrada y un máximo de tres mascotas adicionales');
    }
    const operations = await transport.operationsAvailable(connection);
    if (req.body.paymentMethod || additionalPets.length) transport.requireOperations(operations);
    if (operations) await transport.lockTransportSchedules(connection);

    const breedName = String(breed || '').trim();
    if (breedName.toLocaleLowerCase() === 'otra') {
      await connection.rollback();
      return res.status(400).json({
        message: 'Debe especificar el nombre de la nueva raza',
      });
    }

    if (breedName && species) {
      const speciesCatalog = await obtenerEspeciePorNombre(connection, species);
      if (!speciesCatalog) {
        await connection.rollback();
        return res.status(400).json({
          message: 'La especie seleccionada no pertenece al catálogo',
        });
      }
      await registrarRazaEnCatalogo(
        connection,
        speciesCatalog.especie_id,
        breedName
      );
    }

    if (!(await validarHorarioConfigurado({
      connection,
      moduleCode: 'grooming',
      date,
      time,
      groomingTypeName: type,
    }))) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El horario seleccionado no está habilitado en la configuración',
      });
    }

    const groomingType = await obtenerTipoGrooming(connection, type);
    if (!groomingType) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tipo de grooming no válido' });
    }
    if (additionalPets.length && !groomingType.requiere_transporte) transport.fail('Las mascotas adicionales requieren una ruta de transporte');
    if (groomingType.requiere_transporte && !operations) {
      const transporteDisponible = await validarLimiteTransporte(
        connection,
        date,
        groomingType.tipo_grooming_id
      );

      if (!transporteDisponible) {
        await connection.rollback();

        return res.status(409).json({
          code: 'TRANSPORT_LIMIT',
          message: 'Ya se alcanzó el límite diario de grooming con transporte',
        });
      }
    }

    let pacienteId = patientId || null;
    let tutorId = null;
    let nombreMascota = petName;
    let nombreTutor = tutorName;
    let telefonoTutor = tutorPhone;
    let raza = breedName || null;
    let edadMascota = String(age || '').trim();

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
      raza = breedName || paciente.raza;
      edadMascota = paciente.edad;
    } else {
      tutorId = await obtenerOCrearTutor(connection, {
        tutorFirstName,
        tutorMiddleName,
        tutorFirstSurname,
        tutorSecondSurname,
        tutorPhone,
      });
    }

    const sizeCatalog = await obtenerTamanoAnimal(
      connection,
      req.body.animalSize
    );
    if (!sizeCatalog) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El tamaño seleccionado no pertenece al catálogo',
      });
    }

    const pets = [{ pacienteId, nombreMascota, raza, edadMascota, sizeId: sizeCatalog.tamano_animal_id, cost: Number(groomingCost) || 0 }];
    for (const extra of additionalPets) {
      if (!extra.patientId || pets.some(pet => String(pet.pacienteId) === String(extra.patientId))) transport.fail('No repita mascotas en la misma ruta');
      const patient = await obtenerTutorPorPaciente(connection, extra.patientId);
      if (!patient || String(patient.tutor_id) !== String(tutorId)) transport.fail('Todas las mascotas de una ruta deben pertenecer al mismo tutor');
      const size = await obtenerTamanoAnimal(connection, extra.animalSize);
      if (!size) transport.fail('Seleccione un tamaño válido para cada mascota');
      pets.push({ pacienteId: extra.patientId, nombreMascota: patient.nombre_mascota, raza: patient.raza,
        edadMascota: patient.edad, sizeId: size.tamano_animal_id, cost: transport.money(extra.groomingCost) });
    }
    if (operations) pets[0].cost = transport.money(groomingCost);
    const methodId = operations ? await transport.paymentId(connection, req.body.paymentMethod) : null;
    const routeId = operations && groomingType.requiere_transporte ? await transport.resolveRoute(connection, {
      date, time, typeId: groomingType.tipo_grooming_id, tutorId, address, cost: transportCost,
      patientIds: pets.map(pet => pet.pacienteId),
    }) : null;
    const [initialStatuses] = await connection.query(
      `SELECT estado_grooming_id, nombre
       FROM estado_grooming
       WHERE es_inicial = 1
       LIMIT 1`
    );
    if (initialStatuses.length === 0) {
      throw new Error('No existe un estado inicial configurado para grooming');
    }
    const ids = [];
    for (const pet of pets) {
      const [result] = await connection.query(
        `
        INSERT INTO cita_grooming (
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
          direccion_recogida,
          fecha,
          hora,
          observaciones,
          edad,
          codigo_acceso,
          costo_grooming,
          costo_transporte,
          tipo_grooming_id,
          estado_grooming_id,
          creado_por
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pet.pacienteId,
          tutorId,
          pet.nombreMascota,
          tutorNameParts.firstName,
          tutorNameParts.middleName || null,
          tutorNameParts.firstSurname,
          tutorNameParts.secondSurname || null,
          telefonoTutor,
          pet.raza,
          pet.sizeId,
          groomingType.requiere_transporte ? address || null : null,
          date,
          time,
          observations || null,
          pet.edadMascota,
          accessCode || null,
          pet.cost,
          routeId ? 0 : Number(transportCost) || 0,
          groomingType.tipo_grooming_id,
          initialStatuses[0].estado_grooming_id,
          req.user?.id || null,
        ]
      );

      if (operations && (methodId || routeId)) await transport.saveOperation(connection, result.insertId, methodId, routeId);
      await sincronizarHistorialDesdeGrooming(connection, result.insertId);
      ids.push(String(result.insertId));
    }
    await connection.commit();

    res.status(201).json({
      message: pacienteId
        ? 'Cita de grooming creada correctamente y agregada al historial del paciente'
        : 'Cita de grooming creada correctamente',
      id: ids[0], ids, routeId: routeId ? String(routeId) : null,
    });
  } catch (error) {
    await connection.rollback();

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'Error al crear cita de grooming',
      code: error.code,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const actualizarGrooming = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const {
      patientId,
      type,
      petName,
      breed,
      species,
      age,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      groomingCost,
      transportCost,
      address,
      accessCode,
      observations,
      date,
      time,
      status,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);
    const tutorName = buildFullName(tutorNameParts);

    if (
      !type || !petName || !req.body.animalSize ||
      (!patientId && !String(age || '').trim()) ||
      !areValidNameParts(tutorNameParts) ||
      !tutorPhone || !date || !time || groomingCost === undefined
    ) {
      return res.status(400).json({
        message: 'Tipo, mascota, tutor, teléfono, fecha, hora y costo son obligatorios',
      });
    }

    if (!isTodayOrFuture(date)) {
      return res.status(400).json({
        code: 'INVALID_DATE',
        message: 'La fecha debe ser válida y no puede ser anterior al día actual de Guatemala',
      });
    }

    if (String(age || '').trim().length > 50) {
      return res.status(400).json({
        message: 'La edad no puede exceder 50 caracteres',
      });
    }

    if (!isValidAgeSpacing(age)) {
      return res.status(400).json({
        message: 'La edad debe separar el número de la unidad, por ejemplo: 2 años',
      });
    }
 
    await connection.beginTransaction();
    const operations = await transport.operationsAvailable(connection);
    if (req.body.paymentMethod) transport.requireOperations(operations);
    if (operations) await transport.lockTransportSchedules(connection);

    const breedName = String(breed || '').trim();
    if (breedName.toLocaleLowerCase() === 'otra') {
      await connection.rollback();
      return res.status(400).json({
        message: 'Debe especificar el nombre de la nueva raza',
      });
    }

    if (breedName && species) {
      const speciesCatalog = await obtenerEspeciePorNombre(connection, species);
      if (!speciesCatalog) {
        await connection.rollback();
        return res.status(400).json({
          message: 'La especie seleccionada no pertenece al catálogo',
        });
      }
      await registrarRazaEnCatalogo(
        connection,
        speciesCatalog.especie_id,
        breedName
      );
    }

    if (!(await validarHorarioConfigurado({
      connection,
      moduleCode: 'grooming',
      date,
      time,
      groomingTypeName: type,
    }))) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El horario seleccionado no está habilitado en la configuración',
      });
    }

    const [existing] = await connection.query(
      `SELECT
         grooming.grooming_id,
         grooming.estado_grooming_id,
         estado.es_cancelado,
         estado.nombre AS estado
       FROM cita_grooming grooming
       INNER JOIN estado_grooming estado
         ON estado.estado_grooming_id = grooming.estado_grooming_id
       WHERE grooming.grooming_id = ?
       LIMIT 1`,
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Cita de grooming no encontrada',
      });
    }

    const groomingType = await obtenerTipoGrooming(connection, type);
    if (!groomingType) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tipo de grooming no válido' });
    }
    if (groomingType.requiere_transporte && !operations) {
      const transporteDisponible = await validarLimiteTransporte(
        connection,
        date,
        groomingType.tipo_grooming_id,
        id
      );

      if (!transporteDisponible) {
        await connection.rollback();

        return res.status(409).json({
          code: 'TRANSPORT_LIMIT',
          message: 'Ya se alcanzó el límite diario de grooming con transporte',
        });
      }
    }

    let pacienteId = patientId || null;
    let tutorId = null;
    let nombreMascota = petName;
    let nombreTutor = tutorName;
    let telefonoTutor = tutorPhone;
    let raza = breedName || null;
    let edadMascota = String(age || '').trim();

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
      raza = breedName || paciente.raza;
      edadMascota = paciente.edad;
    } else {
      tutorId = await obtenerOCrearTutor(connection, {
        tutorFirstName,
        tutorMiddleName,
        tutorFirstSurname,
        tutorSecondSurname,
        tutorPhone,
      });
    }

    let groomingStatus = {
      nombre: existing[0].estado,
      estado_grooming_id: existing[0].estado_grooming_id,
      es_cancelado: existing[0].es_cancelado,
    };
    if (status) {
      const [statusRows] = await connection.query(
        `SELECT estado_grooming_id, nombre, es_cancelado
         FROM estado_grooming
         WHERE nombre = ?
         LIMIT 1`,
        [status]
      );
      if (statusRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'El estado seleccionado no pertenece al catálogo',
        });
      }
      groomingStatus = statusRows[0];
    }

    const sizeCatalog = await obtenerTamanoAnimal(
      connection,
      req.body.animalSize
    );
    if (!sizeCatalog) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El tamaño seleccionado no pertenece al catálogo',
      });
    }

    const previousOperation = operations ? await transport.currentOperation(connection, id) : {};
    const methodId = operations ? await transport.paymentId(connection, req.body.paymentMethod, previousOperation.forma_pago_id || null) : null;
    const routeId = operations && groomingType.requiere_transporte ? await transport.resolveRoute(connection, {
      date, time, typeId: groomingType.tipo_grooming_id, tutorId, address, cost: transportCost,
      excludeId: id, patientIds: [pacienteId], active: !groomingStatus.es_cancelado,
    }) : null;
    if (operations) transport.money(groomingCost);
    await connection.query(
      `
      UPDATE cita_grooming
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
        direccion_recogida = ?,
        fecha = ?,
        hora = ?,
        observaciones = ?,
        edad = ?,
        codigo_acceso = ?,
        costo_grooming = ?,
        costo_transporte = ?,
        tipo_grooming_id = ?,
        estado_grooming_id = ?
      WHERE grooming_id = ?
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
        sizeCatalog.tamano_animal_id,
        groomingType.requiere_transporte ? address || null : null,
        date,
        time,
        observations || null,
        edadMascota,
        accessCode || null,
        Number(groomingCost) || 0,
        routeId || (operations && !groomingType.requiere_transporte) ? 0 : Number(transportCost) || 0,
        groomingType.tipo_grooming_id,
        groomingStatus.estado_grooming_id,
        id,
      ]
    );

    if (operations) await transport.saveOperation(connection, id, methodId, routeId);
    await sincronizarHistorialDesdeGrooming(connection, id);
    await connection.commit();

    res.json({
      message: pacienteId
        ? 'Cita de grooming actualizada correctamente y sincronizada con el historial'
        : 'Cita de grooming actualizada correctamente',
    });
  } catch (error) {
    await connection.rollback();

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'Error al actualizar cita de grooming',
      code: error.code,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const cambiarEstadoGrooming = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { status } = req.body;

    const [validStatuses] = await connection.query(
      `SELECT estado_grooming_id, nombre, es_cancelado
       FROM estado_grooming
       WHERE nombre = ?
       LIMIT 1`,
      [status]
    );

    if (validStatuses.length === 0) {
      return res.status(400).json({
        message: 'Estado inválido',
      });
    }

    await connection.beginTransaction();
    if (await transport.operationsAvailable(connection)) {
      await transport.lockTransportSchedules(connection);
      const operation = await transport.currentOperation(connection, id);
      if (operation.ruta_id && !validStatuses[0].es_cancelado) {
        const [routes] = await connection.query(`SELECT ruta.*, DATE_FORMAT(ruta.fecha, '%Y-%m-%d') AS route_date, cita.paciente_id FROM grooming_transporte_ruta ruta
          INNER JOIN grooming_operacion operacion ON operacion.ruta_id = ruta.ruta_id
          INNER JOIN cita_grooming cita ON cita.grooming_id = operacion.grooming_id
          WHERE operacion.grooming_id = ?`, [id]);
        const route = routes[0];
        if (!route) transport.fail('La ruta vinculada no está disponible');
        await transport.resolveRoute(connection, { date: route.route_date,
          time: route.hora, typeId: route.tipo_grooming_id, tutorId: route.tutor_id, address: route.direccion, cost: route.costo,
          excludeId: id, patientIds: [route.paciente_id] });
      }
    }
    const [result] = await connection.query(
      `UPDATE cita_grooming
       SET estado_grooming_id = ?
       WHERE grooming_id = ?`,
      [validStatuses[0].estado_grooming_id, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Cita de grooming no encontrada',
      });
    }
    await sincronizarHistorialDesdeGrooming(connection, id);
    await connection.commit();
    res.json({
      message: 'Estado actualizado correctamente',
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : 'Error al cambiar estado de grooming',
      code: error.code,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const eliminarGrooming = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    await connection.beginTransaction();
    if (await transport.operationsAvailable(connection)) await transport.lockTransportSchedules(connection);
    await connection.query(
      `DELETE FROM historial_clinico
       WHERE grooming_id = ? AND origen = 'Grooming' AND estado_clinico = 'Pendiente'
         AND veterinario_id IS NULL AND diagnostico IS NULL AND tratamiento IS NULL`,
      [id]
    );
    const [result] = await connection.query(
      'DELETE FROM cita_grooming WHERE grooming_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Cita de grooming no encontrada',
      });
    }

    await connection.commit();
    res.json({
      message: 'Cita de grooming eliminada correctamente',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({
      message: 'Error al eliminar cita de grooming',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const listarCompanerosGrooming = async (req, res) => {
  try {
    const patient = await obtenerTutorPorPaciente(pool, req.params.id);
    if (!patient) return res.status(404).json({ message: 'Paciente vinculado no encontrado' });
    const [rows] = await pool.query(`SELECT paciente.paciente_id AS id, paciente.nombre AS petName,
        paciente.edad AS age, raza.nombre AS breed
      FROM paciente
      LEFT JOIN raza ON raza.raza_id = paciente.raza_id
      WHERE paciente.activo = 1 AND paciente.tutor_id = ?
      ORDER BY paciente.nombre, paciente.paciente_id`, [patient.tutor_id]);
    res.json(rows.map(row => ({ ...row, id: String(row.id) })));
  } catch (error) {
    res.status(500).json({ message: 'Error al consultar mascotas del tutor', error: error.message });
  }
};

module.exports = {
  listarCompanerosGrooming,
  listarGrooming,
  obtenerGroomingPorId,
  crearGrooming,
  actualizarGrooming,
  cambiarEstadoGrooming,
  eliminarGrooming,
};
