const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(
  __dirname,
  '../../backups/before-normalization-2026-07-24T01-24-55-554Z.json'
);
const OUTPUT_FILE = path.join(
  __dirname,
  '../../backups/unavet_db_antes_normalizacion_consulta.sql'
);
const DATABASE_NAME = 'unavet_db_antes_normalizacion_consulta';

const PRIMARY_KEYS = {
  cierres_ventas: 'venta_id',
  cierre_ventas_detalle: 'detalle_id',
  citas_clinicas: 'cita_id',
  citas_grooming: 'grooming_id',
  pacientes: 'paciente_id',
  historial_clinico: 'historial_id',
  tratamientos_servicios: 'tratamiento_id',
  vacunaciones: 'vacunacion_id',
  receta_medicamentos: 'receta_medicamento_id',
  productos_inventario: 'producto_id',
};

const DECIMAL_COLUMNS = new Set([
  'transferencia_bi',
  'transferencia_ba',
  'tarjeta_bac',
  'tarjeta_bi',
  'efectivo',
  'cantidad',
  'precio_unitario',
  'subtotal',
  'precio',
  'stock_actual',
  'stock_minimo',
  'precio_compra',
  'precio_venta',
]);

const TEXT_COLUMNS = new Set([
  'descripcion',
  'observaciones',
  'notas',
  'diagnostico',
  'tratamiento',
  'alimentacion',
  'indicaciones',
  'foto_url',
]);

const INTEGER_COLUMNS = new Set([
  'cantidad_dosis',
  'descuenta_inventario',
  'creado_por',
  'usuario_id',
]);

const escapeIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const collectColumns = (rows) => {
  const columns = [];
  const seen = new Set();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  return columns;
};

const inferColumnType = (column, rows) => {
  const values = rows
    .map((row) => row[column])
    .filter((value) => value !== null && value !== undefined);

  if (column.endsWith('_id') || INTEGER_COLUMNS.has(column)) {
    return 'INT UNSIGNED';
  }

  if (DECIMAL_COLUMNS.has(column)) {
    return 'DECIMAL(12,2)';
  }

  if (column === 'hora') {
    return 'TIME';
  }

  if (column === 'creado_en' || column === 'actualizado_en') {
    return 'DATETIME';
  }

  if (column === 'fecha' || column.startsWith('fecha_') || column === 'proxima_dosis') {
    return 'DATE';
  }

  if (TEXT_COLUMNS.has(column)) {
    return column === 'foto_url' ? 'LONGTEXT' : 'TEXT';
  }

  if (values.some((value) => typeof value === 'number' && !Number.isInteger(value))) {
    return 'DECIMAL(12,2)';
  }

  if (values.length > 0 && values.every((value) => typeof value === 'number')) {
    return 'INT';
  }

  const maximumLength = Math.max(0, ...values.map((value) => String(value).length));
  if (maximumLength > 255) {
    return 'LONGTEXT';
  }

  const varcharLength = maximumLength <= 50 ? 100 : 255;
  return `VARCHAR(${varcharLength})`;
};

const formatDateValue = (value, type) => {
  const text = String(value);
  if (type === 'DATE' && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10);
  }
  if (type === 'DATETIME' && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  return text;
};

const escapeValue = (value, type) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);

  const formatted = formatDateValue(value, type);
  return `'${formatted.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};

const backup = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
const lines = [
  '-- UNAVET: vista reconstruida de la base anterior a la normalizacion.',
  `-- Fuente de datos: ${path.basename(SOURCE_FILE)}`,
  `-- Fecha del respaldo: ${backup.createdAt}`,
  '-- IMPORTANTE: el respaldo original no incluia CREATE TABLE.',
  '-- Los tipos y llaves primarias de este archivo fueron reconstruidos para consulta.',
  '-- No se incluyen llaves foraneas ni indices que no pueden comprobarse.',
  `-- Este script usa una base separada y nunca selecciona ni elimina \`${backup.database}\`.`,
  '',
  `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(DATABASE_NAME)}`,
  "  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
  `USE ${escapeIdentifier(DATABASE_NAME)};`,
  '',
];

for (const [table, rows] of Object.entries(backup.tables)) {
  const columns = collectColumns(rows);
  const primaryKey = PRIMARY_KEYS[table];
  const types = Object.fromEntries(
    columns.map((column) => [column, inferColumnType(column, rows)])
  );

  lines.push(`DROP TABLE IF EXISTS ${escapeIdentifier(table)};`);
  lines.push(`CREATE TABLE ${escapeIdentifier(table)} (`);

  const definitions = columns.map((column) => {
    const isPrimary = column === primaryKey;
    const suffix = isPrimary ? ' NOT NULL AUTO_INCREMENT' : ' NULL';
    return `  ${escapeIdentifier(column)} ${types[column]}${suffix}`;
  });

  if (primaryKey && columns.includes(primaryKey)) {
    definitions.push(`  PRIMARY KEY (${escapeIdentifier(primaryKey)})`);
  }

  lines.push(definitions.join(',\n'));
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');

  if (rows.length > 0) {
    lines.push(`INSERT INTO ${escapeIdentifier(table)} (`);
    lines.push(`  ${columns.map(escapeIdentifier).join(', ')}`);
    lines.push(') VALUES');
    lines.push(
      rows
        .map((row) =>
          `  (${columns
            .map((column) => escapeValue(row[column], types[column]))
            .join(', ')})`
        )
        .join(',\n') + ';'
    );
  }

  lines.push('');
}

fs.writeFileSync(OUTPUT_FILE, `${lines.join('\n')}\n`, 'utf8');
console.log(`Vista SQL generada sin ejecutarse: ${OUTPUT_FILE}`);
