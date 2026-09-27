const pool = require('../config/db');
const { singularTableNames } = require('../config/tableNames');

const quoteIdentifier = (name) => `\`${name.replaceAll('`', '``')}\``;

const run = async () => {
  const apply = process.argv.includes('--apply');
  const connection = await pool.getConnection();

  try {
    const [objects] = await connection.query(`
      SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const byName = new Map(objects.map((object) => [object.name, object]));
    const pairs = Object.entries(singularTableNames);
    const oldTables = pairs.filter(([oldName]) => byName.has(oldName));
    const newTables = pairs.filter(([, newName]) => byName.has(newName));

    console.log(`Tablas pendientes de renombrar: ${oldTables.length}`);
    console.log(`Tablas con nombre singular: ${newTables.length}`);

    if (oldTables.length === 0 && newTables.length === pairs.length) {
      console.log('El esquema ya tiene nombres singulares. No hay cambios pendientes.');
      return;
    }

    if (oldTables.length !== pairs.length || newTables.length !== 0) {
      throw new Error('El esquema no coincide con la versión esperada o está parcialmente renombrado; revise las tablas antes de continuar.');
    }

    if (oldTables.some(([name]) => byName.get(name).type !== 'BASE TABLE' || byName.get(name).engine !== 'InnoDB')) {
      throw new Error('Todas las tablas a renombrar deben ser tablas InnoDB.');
    }

    const [[{ dependentObjects }]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()) +
        (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) +
        (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()) +
        (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE())
        AS dependentObjects
    `);
    if (dependentObjects > 0) {
      throw new Error('Hay vistas, triggers, rutinas o eventos que deben revisarse antes de renombrar tablas.');
    }

    if (!apply) {
      console.table(pairs.map(([anterior, nuevo]) => ({ anterior, nuevo })));
      console.log('Solo auditoría. Haga un respaldo y ejecute este comando con --apply durante una ventana de mantenimiento.');
      return;
    }

    const renameSql = `RENAME TABLE ${pairs
      .map(([oldName, newName]) => `${quoteIdentifier(oldName)} TO ${quoteIdentifier(newName)}`)
      .join(', ')}`;
    await connection.query(renameSql);
    console.log(`Se renombraron ${pairs.length} tablas sin borrar datos.`);
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible renombrar las tablas:', error.message);
  process.exitCode = 1;
});
