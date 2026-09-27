const pool = require('../config/db');
const { deleteMedia, saveDataUrl } = require('../utils/mediaStorage');

const targets = [
  {
    table: 'paciente',
    idColumn: 'paciente_id',
    mediaColumn: 'foto_url',
    bucket: 'patients',
  },
  {
    table: 'tratamiento_servicio',
    idColumn: 'tratamiento_id',
    mediaColumn: 'foto_adjunta',
    bucket: 'treatments',
  },
];

const getAudit = async (connection, target) => {
  const [rows] = await connection.query(
    `SELECT
       COUNT(*) AS total,
       SUM(${target.mediaColumn} IS NOT NULL AND LENGTH(${target.mediaColumn}) > 0) AS withPhoto,
       SUM(${target.mediaColumn} LIKE 'data:image/%') AS base64Photos,
       COALESCE(SUM(OCTET_LENGTH(${target.mediaColumn})), 0) AS storedBytes
     FROM ${target.table}`
  );
  return rows[0];
};

const migrateTarget = async (connection, target) => {
  const [ids] = await connection.query(
    `SELECT ${target.idColumn} AS id
     FROM ${target.table}
     WHERE ${target.mediaColumn} LIKE 'data:image/%'
     ORDER BY ${target.idColumn}`
  );
  let migrated = 0;
  let failed = 0;

  for (const { id } of ids) {
    let reference = null;
    try {
      const [rows] = await connection.query(
        `SELECT ${target.mediaColumn} AS media
         FROM ${target.table}
         WHERE ${target.idColumn} = ?
         LIMIT 1`,
        [id]
      );
      const original = rows[0]?.media;
      if (!original || !String(original).startsWith('data:image/')) continue;

      reference = await saveDataUrl(original, target.bucket);
      const [result] = await connection.query(
        `UPDATE ${target.table}
         SET ${target.mediaColumn} = ?
         WHERE ${target.idColumn} = ? AND ${target.mediaColumn} = ?`,
        [reference, id, original]
      );

      if (result.affectedRows !== 1) {
        await deleteMedia(reference);
        continue;
      }
      migrated += 1;
    } catch (error) {
      failed += 1;
      await deleteMedia(reference).catch(() => {});
      console.error(`${target.table} #${id}: ${error.message}`);
    }
  }

  return { migrated, failed };
};

const run = async () => {
  const apply = process.argv.includes('--apply');
  const connection = await pool.getConnection();

  try {
    const before = {};
    for (const target of targets) {
      before[target.table] = await getAudit(connection, target);
    }

    console.log('Estado de fotografías:');
    console.table(before);

    if (!apply) {
      console.log('Auditoría completada. Use --apply para migrar las imágenes Base64.');
      return;
    }

    const results = {};
    for (const target of targets) {
      results[target.table] = await migrateTarget(connection, target);
    }

    console.log('Migración completada:');
    console.table(results);
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('No fue posible auditar o migrar las fotografías:', error.message);
  process.exit(1);
});
