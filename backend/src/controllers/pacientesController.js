const pool = require('../config/db');
const {
  isValidAgeSpacing,
  isValidName,
  isValidPhone,
} = require('../utils/inputValidation');
const {
  areValidNameParts,
  getTutorNameParts,
} = require('../utils/personName');

const mapPacienteToFrontend = (row) => ({
  id: String(row.paciente_id),
  petName: row.nombre_mascota,
  species: row.especie,
  breed: row.raza,
  age: row.edad,
  sex: row.sexo,
  reproductiveStatus: row.estado_reproductivo,
  color: row.color,
  diet: row.alimentacion,
  photo: row.foto_url,
  tutorFirstName: row.primer_nombre_tutor,
  tutorMiddleName: row.segundo_nombre_tutor || '',
  tutorFirstSurname: row.primer_apellido_tutor || '',
  tutorSecondSurname: row.segundo_apellido_tutor || '',
  tutorName: row.nombre_tutor,
  tutorPhone: row.telefono_tutor,
  tutorEmail: row.correo_tutor,
  tutorAddress: row.direccion_tutor,
  registrationDate: row.fecha_registro,
  lastVisit: row.ultima_visita,
  observations: row.observaciones,
});

const buscarEspeciePorNombre = async (connection, nombre) => {
  const [rows] = await connection.query(
    'SELECT especie_id FROM especies WHERE nombre = ? AND activo = 1 LIMIT 1',
    [nombre]
  );

  return rows[0] || null;
};

const buscarReferenciaCatalogo = async (
  connection,
  table,
  idColumn,
  name
) => {
  if (!name) return null;
  const allowedCatalogs = {
    sexos: 'sexo_id',
    estados_reproductivos: 'estado_reproductivo_id',
  };
  if (allowedCatalogs[table] !== idColumn) {
    throw new Error('Catálogo de paciente no permitido');
  }

  const [rows] = await connection.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE nombre = ? LIMIT 1`,
    [name]
  );
  return rows[0]?.id || null;
};

const obtenerOCrearRaza = async (connection, especieId, nombreRaza) => {
  if (!nombreRaza) return null;

  const [rows] = await connection.query(
    `
    SELECT raza_id 
    FROM razas 
    WHERE especie_id = ? AND nombre = ? 
    LIMIT 1
    `,
    [especieId, nombreRaza]
  );

  if (rows.length > 0) {
    return rows[0].raza_id;
  }

  const [result] = await connection.query(
    `
    INSERT INTO razas (especie_id, nombre, activo)
    VALUES (?, ?, 1)
    `,
    [especieId, nombreRaza]
  );

  return result.insertId;
};

const obtenerOCrearTutor = async (connection, data) => {
  const {
    tutorFirstName,
    tutorMiddleName,
    tutorFirstSurname,
    tutorSecondSurname,
    tutorPhone,
    tutorEmail,
    tutorAddress,
  } = data;

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
    const tutorId = rows[0].tutor_id;

    await connection.query(
      `
      UPDATE tutores
      SET primer_nombre = ?, segundo_nombre = ?,
          primer_apellido = ?, segundo_apellido = ?,
          correo = ?, direccion = ?, activo = 1
      WHERE tutor_id = ?
      `,
      [
        tutorFirstName,
        tutorMiddleName || null,
        tutorFirstSurname,
        tutorSecondSurname || null,
        tutorEmail || null,
        tutorAddress || null,
        tutorId,
      ]
    );

    return tutorId;
  }

  const [result] = await connection.query(
    `
    INSERT INTO tutores (
      primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      telefono, correo, direccion, activo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      tutorFirstName,
      tutorMiddleName || null,
      tutorFirstSurname,
      tutorSecondSurname || null,
      tutorPhone,
      tutorEmail || null,
      tutorAddress || null,
    ]
  );

  return result.insertId;
};

const listarPacientes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.paciente_id,
        p.nombre AS nombre_mascota,
        p.edad,
        sexo_catalogo.nombre AS sexo,
        reproductivo_catalogo.nombre AS estado_reproductivo,
        p.color,
        p.alimentacion,
        p.foto_url,
        p.observaciones,
        DATE_FORMAT(p.fecha_registro, '%Y-%m-%d') AS fecha_registro,
        DATE_FORMAT(visita.ultima_visita, '%Y-%m-%d') AS ultima_visita,
        e.nombre AS especie,
        r.nombre AS raza,
        t.primer_nombre AS primer_nombre_tutor,
        t.segundo_nombre AS segundo_nombre_tutor,
        t.primer_apellido AS primer_apellido_tutor,
        t.segundo_apellido AS segundo_apellido_tutor,
        CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
          t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
        t.telefono AS telefono_tutor,
        t.correo AS correo_tutor,
        t.direccion AS direccion_tutor
      FROM pacientes p
      INNER JOIN tutores t ON p.tutor_id = t.tutor_id
      INNER JOIN especies e ON p.especie_id = e.especie_id
      LEFT JOIN razas r ON p.raza_id = r.raza_id
      INNER JOIN sexos sexo_catalogo ON p.sexo_id = sexo_catalogo.sexo_id
      LEFT JOIN estados_reproductivos reproductivo_catalogo
        ON p.estado_reproductivo_id =
          reproductivo_catalogo.estado_reproductivo_id
      LEFT JOIN (
        SELECT paciente_id, MAX(fecha) AS ultima_visita
        FROM historial_clinico
        WHERE estado_clinico = 'Completado'
        GROUP BY paciente_id
      ) visita ON visita.paciente_id = p.paciente_id
      WHERE p.activo = 1
      ORDER BY p.paciente_id DESC
      `
    );

    res.json(rows.map(mapPacienteToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar pacientes',
      error: error.message,
    });
  }
};

const obtenerPacientePorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT 
        p.paciente_id,
        p.nombre AS nombre_mascota,
        p.edad,
        sexo_catalogo.nombre AS sexo,
        reproductivo_catalogo.nombre AS estado_reproductivo,
        p.color,
        p.alimentacion,
        p.foto_url,
        p.observaciones,
        DATE_FORMAT(p.fecha_registro, '%Y-%m-%d') AS fecha_registro,
        DATE_FORMAT(visita.ultima_visita, '%Y-%m-%d') AS ultima_visita,
        e.nombre AS especie,
        r.nombre AS raza,
        t.primer_nombre AS primer_nombre_tutor,
        t.segundo_nombre AS segundo_nombre_tutor,
        t.primer_apellido AS primer_apellido_tutor,
        t.segundo_apellido AS segundo_apellido_tutor,
        CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
          t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
        t.telefono AS telefono_tutor,
        t.correo AS correo_tutor,
        t.direccion AS direccion_tutor
      FROM pacientes p
      INNER JOIN tutores t ON p.tutor_id = t.tutor_id
      INNER JOIN especies e ON p.especie_id = e.especie_id
      LEFT JOIN razas r ON p.raza_id = r.raza_id
      INNER JOIN sexos sexo_catalogo ON p.sexo_id = sexo_catalogo.sexo_id
      LEFT JOIN estados_reproductivos reproductivo_catalogo
        ON p.estado_reproductivo_id =
          reproductivo_catalogo.estado_reproductivo_id
      LEFT JOIN (
        SELECT paciente_id, MAX(fecha) AS ultima_visita
        FROM historial_clinico
        WHERE estado_clinico = 'Completado'
        GROUP BY paciente_id
      ) visita ON visita.paciente_id = p.paciente_id
      WHERE p.paciente_id = ? AND p.activo = 1
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Paciente no encontrado',
      });
    }

    res.json(mapPacienteToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener paciente',
      error: error.message,
    });
  }
};

const crearPaciente = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      petName,
      species,
      breed,
      age,
      sex,
      reproductiveStatus,
      color,
      diet,
      photo,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      tutorEmail,
      tutorAddress,
      observations,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);

    if (
      !petName || !species || !sex || !String(age || '').trim() ||
      !tutorPhone ||
      !areValidNameParts(tutorNameParts)
    ) {
      return res.status(400).json({
        message: 'Nombre de mascota, edad, especie, sexo, tutor y teléfono son obligatorios',
      });
    }

    if (String(age).trim().length > 50) {
      return res.status(400).json({
        message: 'La edad no puede exceder 50 caracteres',
      });
    }

    if (!isValidAgeSpacing(age)) {
      return res.status(400).json({
        message: 'La edad debe separar el número de la unidad, por ejemplo: 2 años',
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

    await connection.beginTransaction();

    const especie = await buscarEspeciePorNombre(connection, species);

    if (!especie) {
      await connection.rollback();

      return res.status(400).json({
        message: 'La especie seleccionada no existe',
      });
    }

    const razaId = await obtenerOCrearRaza(connection, especie.especie_id, breed);
    const sexoId = await buscarReferenciaCatalogo(
      connection,
      'sexos',
      'sexo_id',
      sex
    );
    const estadoReproductivoId = await buscarReferenciaCatalogo(
      connection,
      'estados_reproductivos',
      'estado_reproductivo_id',
      reproductiveStatus
    );

    if (!sexoId || (reproductiveStatus && !estadoReproductivoId)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El sexo o el estado reproductivo no pertenece al catálogo',
      });
    }

    const tutorId = await obtenerOCrearTutor(connection, {
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      tutorEmail,
      tutorAddress,
    });

    const [result] = await connection.query(
      `
      INSERT INTO pacientes (
        tutor_id,
        especie_id,
        raza_id,
        nombre,
        edad,
        sexo_id,
        estado_reproductivo_id,
        color,
        alimentacion,
        foto_url,
        observaciones,
        fecha_registro,
        activo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 1)
      `,
      [
        tutorId,
        especie.especie_id,
        razaId,
        petName,
        String(age).trim(),
        sexoId,
        estadoReproductivoId,
        color || null,
        diet || null,
        photo || null,
        observations || null,
      ]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Paciente creado correctamente',
      id: String(result.insertId),
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al crear paciente',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const actualizarPaciente = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const {
      petName,
      species,
      breed,
      age,
      sex,
      reproductiveStatus,
      color,
      diet,
      photo,
      tutorFirstName,
      tutorMiddleName,
      tutorFirstSurname,
      tutorSecondSurname,
      tutorPhone,
      tutorEmail,
      tutorAddress,
      observations,
    } = req.body;

    const tutorNameParts = getTutorNameParts(req.body);

    if (
      !petName || !species || !sex || !String(age || '').trim() ||
      !tutorPhone ||
      !areValidNameParts(tutorNameParts)
    ) {
      return res.status(400).json({
        message: 'Nombre de mascota, edad, especie, sexo, tutor y teléfono son obligatorios',
      });
    }

    if (String(age).trim().length > 50) {
      return res.status(400).json({
        message: 'La edad no puede exceder 50 caracteres',
      });
    }

    if (!isValidAgeSpacing(age)) {
      return res.status(400).json({
        message: 'La edad debe separar el número de la unidad, por ejemplo: 2 años',
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

    const [pacientes] = await connection.query(
      'SELECT paciente_id, tutor_id FROM pacientes WHERE paciente_id = ? AND activo = 1 LIMIT 1',
      [id]
    );

    if (pacientes.length === 0) {
      return res.status(404).json({
        message: 'Paciente no encontrado',
      });
    }

    await connection.beginTransaction();

    const especie = await buscarEspeciePorNombre(connection, species);

    if (!especie) {
      await connection.rollback();

      return res.status(400).json({
        message: 'La especie seleccionada no existe',
      });
    }

    const razaId = await obtenerOCrearRaza(connection, especie.especie_id, breed);
    const sexoId = await buscarReferenciaCatalogo(
      connection,
      'sexos',
      'sexo_id',
      sex
    );
    const estadoReproductivoId = await buscarReferenciaCatalogo(
      connection,
      'estados_reproductivos',
      'estado_reproductivo_id',
      reproductiveStatus
    );

    if (!sexoId || (reproductiveStatus && !estadoReproductivoId)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'El sexo o el estado reproductivo no pertenece al catálogo',
      });
    }

    await connection.query(
      `
      UPDATE tutores
      SET primer_nombre = ?, segundo_nombre = ?,
          primer_apellido = ?, segundo_apellido = ?,
          telefono = ?, correo = ?, direccion = ?
      WHERE tutor_id = ?
      `,
      [
        tutorFirstName,
        tutorMiddleName || null,
        tutorFirstSurname,
        tutorSecondSurname || null,
        tutorPhone,
        tutorEmail || null,
        tutorAddress || null,
        pacientes[0].tutor_id,
      ]
    );

    await connection.query(
      `
      UPDATE pacientes
      SET 
        especie_id = ?,
        raza_id = ?,
        nombre = ?,
        edad = ?,
        sexo_id = ?,
        estado_reproductivo_id = ?,
        color = ?,
        alimentacion = ?,
        foto_url = ?,
        observaciones = ?
      WHERE paciente_id = ?
      `,
      [
        especie.especie_id,
        razaId,
        petName,
        String(age).trim(),
        sexoId,
        estadoReproductivoId,
        color || null,
        diet || null,
        photo || null,
        observations || null,
        id,
      ]
    );

    await connection.commit();

    res.json({
      message: 'Paciente actualizado correctamente',
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      message: 'Error al actualizar paciente',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const eliminarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      `
      UPDATE pacientes
      SET activo = 0
      WHERE paciente_id = ?
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Paciente no encontrado',
      });
    }

    res.json({
      message: 'Paciente eliminado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al eliminar paciente',
      error: error.message,
    });
  }
};

module.exports = {
  listarPacientes,
  obtenerPacientePorId,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente,
};
