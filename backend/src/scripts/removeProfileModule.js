const pool = require('../config/db');

const removeProfileModule = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[module]] = await connection.query(
      'SELECT modulo_id FROM modulos_sistema WHERE codigo = ? LIMIT 1',
      ['profile']
    );

    if (!module) {
      await connection.commit();
      console.log('El módulo Mi perfil ya no existe en la base de datos.');
      return;
    }

    await connection.query(
      'DELETE FROM rol_permisos WHERE modulo_id = ?',
      [module.modulo_id]
    );
    await connection.query(
      'DELETE FROM horarios_atencion WHERE modulo_id = ?',
      [module.modulo_id]
    );
    await connection.query(
      'DELETE FROM modulos_sistema WHERE modulo_id = ?',
      [module.modulo_id]
    );

    await connection.commit();
    console.log('El módulo Mi perfil y sus permisos fueron eliminados.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

removeProfileModule().catch((error) => {
  console.error('No se pudo eliminar el módulo Mi perfil:', error.message);
  process.exitCode = 1;
});
