const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedUsers() {
  try {
    const users = [
      {
        email: process.env.SEED_ADMIN_EMAIL,
        password: process.env.SEED_ADMIN_PASSWORD,
      },
      {
        email: process.env.SEED_VET_EMAIL,
        password: process.env.SEED_VET_PASSWORD,
      },
      {
        email: process.env.SEED_ASSISTANT_EMAIL,
        password: process.env.SEED_ASSISTANT_PASSWORD,
      },
    ].filter((user) => user.email && user.password);

    if (users.length === 0) {
      throw new Error(
        'Configura al menos un correo y contraseña SEED_* en backend/.env'
      );
    }

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      const [result] = await pool.query(
        'UPDATE usuarios SET password_hash = ? WHERE correo = ?',
        [passwordHash, user.email]
      );
      if (result.affectedRows === 0) {
        console.warn(`No se encontró el usuario ${user.email}`);
      }
    }

    console.log('Usuarios iniciales actualizados correctamente');
  } catch (error) {
    console.error('Error al actualizar usuarios:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedUsers();
