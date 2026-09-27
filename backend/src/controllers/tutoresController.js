const pool = require('../config/db');

const listarTutores = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        tutor_id AS id,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        telefono,
        correo,
        direccion,
        CONCAT_WS(
          ' ',
          primer_nombre,
          segundo_nombre,
          primer_apellido,
          segundo_apellido
        ) AS nombre_completo
      FROM tutor
      WHERE activo = 1
      ORDER BY primer_apellido, primer_nombre, tutor_id DESC
      `
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar tutores',
      error: error.message,
    });
  }
};

const listarTutoresConPacientes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        tutor.tutor_id,
        tutor.primer_nombre,
        tutor.segundo_nombre,
        tutor.primer_apellido,
        tutor.segundo_apellido,
        tutor.telefono,
        tutor.correo,
        tutor.direccion,
        CONCAT_WS(
          ' ',
          tutor.primer_nombre,
          tutor.segundo_nombre,
          tutor.primer_apellido,
          tutor.segundo_apellido
        ) AS nombre_completo,
        paciente.paciente_id,
        paciente.nombre AS nombre_mascota,
        especie.nombre AS especie,
        raza.nombre AS raza
      FROM tutor tutor
      LEFT JOIN paciente paciente
        ON paciente.tutor_id = tutor.tutor_id
        AND paciente.activo = 1
      LEFT JOIN especie especie
        ON especie.especie_id = paciente.especie_id
      LEFT JOIN raza raza
        ON raza.raza_id = paciente.raza_id
      WHERE tutor.activo = 1
      ORDER BY
        tutor.primer_apellido,
        tutor.primer_nombre,
        tutor.tutor_id DESC,
        paciente.nombre
      `
    );

    const tutorsById = new Map();

    rows.forEach((row) => {
      const tutorId = String(row.tutor_id);

      if (!tutorsById.has(tutorId)) {
        tutorsById.set(tutorId, {
          id: tutorId,
          primer_nombre: row.primer_nombre,
          segundo_nombre: row.segundo_nombre || '',
          primer_apellido: row.primer_apellido,
          segundo_apellido: row.segundo_apellido || '',
          nombre_completo: row.nombre_completo,
          telefono: row.telefono,
          correo: row.correo || '',
          direccion: row.direccion || '',
          mascotas: [],
        });
      }

      if (row.paciente_id) {
        tutorsById.get(tutorId).mascotas.push({
          id: String(row.paciente_id),
          nombre: row.nombre_mascota,
          especie: row.especie || '',
          raza: row.raza || '',
        });
      }
    });

    res.json(Array.from(tutorsById.values()));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar tutores con sus pacientes',
      error: error.message,
    });
  }
};

const eliminarTutor = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tutors] = await connection.query(
      `SELECT tutor_id
       FROM tutor
       WHERE tutor_id = ? AND activo = 1
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (tutors.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: 'Tutor no encontrado',
      });
    }

    const [patientRows] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM paciente
       WHERE tutor_id = ? AND activo = 1`,
      [id]
    );
    const activePatients = Number(patientRows[0]?.total || 0);

    if (activePatients > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: `No se puede eliminar el tutor porque tiene ${activePatients} mascota${activePatients === 1 ? '' : 's'} activa${activePatients === 1 ? '' : 's'} registrada${activePatients === 1 ? '' : 's'}.`,
      });
    }

    await connection.query(
      'UPDATE tutor SET activo = 0 WHERE tutor_id = ?',
      [id]
    );
    await connection.commit();

    res.json({
      message: 'Tutor eliminado correctamente',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({
      message: 'Error al eliminar tutor',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  listarTutores,
  listarTutoresConPacientes,
  eliminarTutor,
};
