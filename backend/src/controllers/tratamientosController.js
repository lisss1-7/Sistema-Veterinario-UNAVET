const pool = require('../config/db');

const TRATAMIENTO_SELECT = `
  SELECT
    tratamiento.tratamiento_id,
    tratamiento.paciente_id,
    DATE_FORMAT(tratamiento.fecha, '%Y-%m-%d') AS fecha,
    tipo.nombre AS tipo_catalogo,
    COALESCE(prueba.nombre, tratamiento.nombre) AS nombre,
    tratamiento.descripcion,
    tratamiento.resultado,
    tratamiento.veterinario_id,
    CONCAT_WS(
      ' ',
      veterinario.primer_nombre,
      veterinario.segundo_nombre,
      veterinario.primer_apellido,
      veterinario.segundo_apellido
    ) AS veterinario,
    estado.nombre AS estado_catalogo,
    tratamiento.observaciones,
    categoria.nombre AS categoria,
    tratamiento.foto_adjunta
  FROM tratamientos_servicios tratamiento
  INNER JOIN tipos_tratamiento tipo
    ON tipo.tipo_tratamiento_id = tratamiento.tipo_tratamiento_id
  INNER JOIN estados_tratamiento estado
    ON estado.estado_tratamiento_id =
      tratamiento.estado_tratamiento_id
  LEFT JOIN veterinarios veterinario
    ON veterinario.veterinario_id = tratamiento.veterinario_id
  LEFT JOIN pruebas_laboratorio prueba
    ON prueba.prueba_id = tratamiento.prueba_laboratorio_id
  LEFT JOIN categorias_tratamiento categoria
    ON categoria.categoria_tratamiento_id =
      tratamiento.categoria_tratamiento_id
`;

const mapTratamientoToFrontend = (row) => ({
  id: String(row.tratamiento_id),
  patientId: String(row.paciente_id),
  requestDate: row.fecha,
  type: row.tipo_catalogo,
  name: row.nombre,
  category: row.categoria || row.tipo_catalogo,
  diagnosisOrReason: row.descripcion || '',
  result: row.resultado || '',
  veterinarianId: row.veterinario_id
    ? String(row.veterinario_id)
    : '',
  veterinarian: row.veterinario || '',
  status: row.estado_catalogo,
  observations: row.observaciones || '',
  attachmentPhoto: row.foto_adjunta || '',
});

const listarTratamientos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${TRATAMIENTO_SELECT}
       ORDER BY tratamiento.fecha DESC, tratamiento.tratamiento_id DESC`
    );
    res.json(rows.map(mapTratamientoToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar tratamientos y servicios',
      error: error.message,
    });
  }
};

const listarTratamientosPorPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    const [rows] = await pool.query(
      `${TRATAMIENTO_SELECT}
       WHERE tratamiento.paciente_id = ?
       ORDER BY tratamiento.fecha DESC, tratamiento.tratamiento_id DESC`,
      [pacienteId]
    );
    res.json(rows.map(mapTratamientoToFrontend));
  } catch (error) {
    res.status(500).json({
      message: 'Error al listar tratamientos y servicios',
      error: error.message,
    });
  }
};

const obtenerTratamientoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `${TRATAMIENTO_SELECT}
       WHERE tratamiento.tratamiento_id = ?
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Tratamiento o servicio no encontrado',
      });
    }
    res.json(mapTratamientoToFrontend(rows[0]));
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener tratamiento o servicio',
      error: error.message,
    });
  }
};

const crearTratamiento = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      patientId,
      type,
      name,
      diagnosisOrReason,
      result,
      veterinarianId,
      status,
    } = req.body;

    if (
      !patientId ||
      !type ||
      !name ||
      !diagnosisOrReason ||
      !veterinarianId ||
      !status
    ) {
      return res.status(400).json({
        message:
          'Paciente, tipo, nombre, motivo, veterinario y estado son obligatorios',
      });
    }

    const [[types], [statuses], [veterinarians], [patients]] =
      await Promise.all([
        connection.query(
          `SELECT tipo_tratamiento_id
           FROM tipos_tratamiento
           WHERE nombre = ?
           LIMIT 1`,
          [type]
        ),
        connection.query(
          `SELECT estado_tratamiento_id
           FROM estados_tratamiento
           WHERE nombre = ?
           LIMIT 1`,
          [status]
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
      types.length === 0 ||
      statuses.length === 0 ||
      veterinarians.length === 0 ||
      patients.length === 0
    ) {
      return res.status(400).json({
        message:
          'Paciente, tipo, estado o veterinario no pertenecen al catálogo activo',
      });
    }

    const isLaboratory = type === 'Servicio de laboratorio';
    let laboratoryTestId = null;
    if (isLaboratory) {
      const [tests] = await connection.query(
        `SELECT prueba_id
         FROM pruebas_laboratorio
         WHERE nombre = ?
         LIMIT 1`,
        [name]
      );
      if (tests.length === 0) {
        return res.status(400).json({
          message: 'La prueba seleccionada no pertenece al catálogo',
        });
      }
      laboratoryTestId = tests[0].prueba_id;
    }

    let categoryId = null;
    const categoryName = String(req.body.category || '').trim();
    if (categoryName) {
      await connection.query(
        `INSERT INTO categorias_tratamiento (nombre, activo)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE activo = 1`,
        [categoryName]
      );
      const [categories] = await connection.query(
        `SELECT categoria_tratamiento_id
         FROM categorias_tratamiento
         WHERE nombre = ?
         LIMIT 1`,
        [categoryName]
      );
      categoryId =
        categories[0]?.categoria_tratamiento_id || null;
    }

    const [resultInsert] = await connection.query(
      `INSERT INTO tratamientos_servicios (
         paciente_id,
         fecha,
         nombre,
         descripcion,
         resultado,
         veterinario_id,
         observaciones,
         foto_adjunta,
         prueba_laboratorio_id,
         categoria_tratamiento_id,
         tipo_tratamiento_id,
         estado_tratamiento_id,
         creado_por
       )
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        isLaboratory ? null : name,
        diagnosisOrReason,
        result || null,
        veterinarianId,
        req.body.observations || null,
        req.body.attachmentPhoto || null,
        laboratoryTestId,
        categoryId,
        types[0].tipo_tratamiento_id,
        statuses[0].estado_tratamiento_id,
        req.user?.id || null,
      ]
    );

    res.status(201).json({
      message: 'Tratamiento o servicio agregado correctamente',
      id: String(resultInsert.insertId),
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al agregar tratamiento o servicio',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const eliminarTratamiento = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM tratamientos_servicios
       WHERE tratamiento_id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Tratamiento o servicio no encontrado',
      });
    }
    res.json({
      message: 'Tratamiento o servicio eliminado correctamente',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al eliminar tratamiento o servicio',
      error: error.message,
    });
  }
};

module.exports = {
  listarTratamientos,
  listarTratamientosPorPaciente,
  obtenerTratamientoPorId,
  crearTratamiento,
  eliminarTratamiento,
};
