const pool = require('../config/db');
const { syncVeterinarianForUser } = require('../utils/veterinarian');

const syncAdministratorVeterinarians = async (connection) => {
  const [users] = await connection.query(
    `SELECT usuario.usuario_id, rol.nombre AS rol
     FROM usuario usuario
     INNER JOIN rol rol ON rol.rol_id = usuario.rol_id
     INNER JOIN estado_usuario estado ON estado.estado_usuario_id = usuario.estado_usuario_id
     WHERE usuario.eliminado_en IS NULL
       AND rol.activo = 1
       AND estado.activo = 1 AND estado.permite_acceso = 1
       AND LOWER(TRIM(rol.nombre)) = ?`,
    ['administrador']
  );

  for (const user of users) {
    await syncVeterinarianForUser(connection, user.usuario_id, user.rol);
  }
  return users.length;
};

const run = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const count = await syncAdministratorVeterinarians(connection);
    await connection.commit();
    console.log(`Administradores sincronizados con el catálogo de veterinarios: ${count}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error('No fue posible sincronizar los administradores veterinarios:', error);
    process.exitCode = 1;
  });
}

module.exports = { syncAdministratorVeterinarians };
