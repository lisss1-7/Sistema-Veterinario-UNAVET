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
      FROM tutores
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

module.exports = {
  listarTutores,
};
