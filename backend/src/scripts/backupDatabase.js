const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const run = async () => {
  const connection = await pool.getConnection();

  try {
    const [tables] = await connection.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    const backup = {
      createdAt: new Date().toISOString(),
      database: process.env.DB_NAME,
      tables: {},
    };

    for (const { TABLE_NAME: table } of tables) {
      const [[createRow]] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      backup.tables[table] = {
        createSql: createRow['Create Table'],
        rows,
      };
    }

    const backupDir = path.join(__dirname, '../../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(
      backupDir,
      `full-backup-${timestamp}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Respaldo completo creado: ${outputPath}`);
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Error al crear respaldo completo:', error);
  process.exit(1);
});
