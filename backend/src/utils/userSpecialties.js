const specialtiesSelect = (userAlias = 'u') => `
  (
    SELECT GROUP_CONCAT(
      especialidad.nombre
      ORDER BY relacion.es_principal DESC, especialidad.nombre
      SEPARATOR ', '
    )
    FROM usuario_especialidades relacion
    INNER JOIN especialidades especialidad
      ON especialidad.especialidad_id = relacion.especialidad_id
    WHERE relacion.usuario_id = ${userAlias}.usuario_id
      AND especialidad.activo = 1
  ) AS especialidad
`;

const normalizeSpecialties = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(
    values
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
};

const syncUserSpecialties = async (
  connection,
  userId,
  specialties
) => {
  const normalized = normalizeSpecialties(specialties);
  await connection.query(
    `DELETE FROM usuario_especialidades
     WHERE usuario_id = ?`,
    [userId]
  );

  for (let index = 0; index < normalized.length; index += 1) {
    const name = normalized[index];
    await connection.query(
      `INSERT INTO especialidades (nombre, activo)
       VALUES (?, 1)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [name]
    );
    await connection.query(
      `INSERT INTO usuario_especialidades (
         usuario_id,
         especialidad_id,
         es_principal
       )
       SELECT ?, especialidad_id, ?
       FROM especialidades
       WHERE nombre = ?`,
      [userId, index === 0 ? 1 : 0, name]
    );
  }
};

module.exports = {
  specialtiesSelect,
  syncUserSpecialties,
};
