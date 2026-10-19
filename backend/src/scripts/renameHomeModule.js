const pool = require('../config/db');

const run = async () => {
  try {
    const [modules] = await pool.query(
      'SELECT modulo_id FROM modulo_sistema WHERE codigo = ?',
      ['dashboard']
    );
    if (modules.length !== 1) {
      throw new Error('No se encontró un único módulo de inicio en el catálogo');
    }

    await pool.query(
      'UPDATE modulo_sistema SET nombre = ? WHERE modulo_id = ? AND codigo = ?',
      ['Inicio', modules[0].modulo_id, 'dashboard']
    );
    console.log('El módulo de inicio ahora se muestra como Inicio.');
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible actualizar el nombre del módulo:', error.message);
  process.exitCode = 1;
});
