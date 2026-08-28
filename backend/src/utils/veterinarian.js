const normalizeRole = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');

const isVeterinarianRole = (roleName) =>
  normalizeRole(roleName).includes('veterinario');

const syncVeterinarianForUser = async (
  connection,
  userId,
  roleName = null
) => {
  const [rows] = await connection.query(
    `
    SELECT
      usuario.usuario_id,
      usuario.primer_nombre,
      usuario.segundo_nombre,
      usuario.primer_apellido,
      usuario.segundo_apellido,
      rol.nombre AS rol
    FROM usuarios usuario
    INNER JOIN roles rol ON rol.rol_id = usuario.rol_id
    WHERE usuario.usuario_id = ?
    LIMIT 1
    `,
    [userId]
  );
  if (rows.length === 0) return null;

  const user = rows[0];
  const veterinarianRole = roleName || user.rol;
  if (!isVeterinarianRole(veterinarianRole)) {
    await connection.query(
      'UPDATE veterinarios SET activo = 0 WHERE usuario_id = ?',
      [userId]
    );
    return null;
  }

  await connection.query(
    `
    INSERT INTO veterinarios (
      usuario_id,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      activo
    )
    VALUES (?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      primer_nombre = VALUES(primer_nombre),
      segundo_nombre = VALUES(segundo_nombre),
      primer_apellido = VALUES(primer_apellido),
      segundo_apellido = VALUES(segundo_apellido),
      activo = 1
    `,
    [
      user.usuario_id,
      user.primer_nombre,
      user.segundo_nombre || null,
      user.primer_apellido || 'Sin apellido',
      user.segundo_apellido || null,
    ]
  );

  const [veterinarians] = await connection.query(
    'SELECT veterinario_id FROM veterinarios WHERE usuario_id = ? LIMIT 1',
    [userId]
  );
  return veterinarians[0]?.veterinario_id || null;
};

module.exports = {
  isVeterinarianRole,
  syncVeterinarianForUser,
};
