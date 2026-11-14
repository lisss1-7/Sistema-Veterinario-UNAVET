const KG_PER_LB = 0.45359237;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const available = async connection => {
  const [rows] = await connection.query(`SELECT COUNT(*) AS prescription_consultation_tables
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receta_consulta'`);
  return Number(rows[0]?.prescription_consultation_tables) === 1;
};
const weightKg = weight => {
  if (weight === null || weight === undefined) return null;
  if (!weight || !['kg', 'lb'].includes(weight.unit) || !['string', 'number'].includes(typeof weight.value)
    || !String(weight.value).trim()) fail('Indique un peso válido en kg o lb');
  const value = Number(weight.value), kg = weight.unit === 'lb' ? value * KG_PER_LB : value;
  if (!Number.isFinite(kg) || kg < 0.000001 || kg > 9999.999999) fail('El peso debe ser positivo y menor que 10000 kg');
  return Math.round(kg * 1e6) / 1e6;
};
const parseProcedures = value => typeof value === 'string' ? JSON.parse(value) : value;
const totals = procedures => {
  const items = procedures.map(item => ({ ...item, subtotal: Math.round(item.unitPrice * 100) * item.quantity / 100 }));
  return { procedures: items, procedureTotal: items.reduce((sum, item) => sum + Math.round(item.subtotal * 100), 0) / 100 };
};
const readDetails = async (connection, ids) => {
  if (!ids.length || !(await available(connection))) return new Map();
  const [rows] = await connection.query('SELECT receta_id, peso_kg, procedimientos FROM receta_consulta WHERE receta_id IN (?)', [ids]);
  return new Map(rows.map(row => [String(row.receta_id), { consultationVersion: 1,
    weightKg: row.peso_kg === null ? null : Number(row.peso_kg), ...totals(parseProcedures(row.procedimientos)) }]));
};
const enrich = async (connection, recipes) => {
  const details = await readDetails(connection, recipes.map(recipe => recipe.id));
  return recipes.map(recipe => details.has(recipe.id) ? { ...recipe, ...details.get(recipe.id) } : recipe);
};
const prepare = async (connection, body, { id, patientChanged = false } = {}) => {
  const requested = body.consultationVersion !== undefined || body.weight !== undefined || body.procedures !== undefined;
  if (!(await available(connection))) {
    if (requested) fail('Se requiere primero la migración de peso y procedimientos de recetas', 503);
    return null;
  }
  const old = id ? (await readDetails(connection, [id])).get(String(id)) : null;
  if (id && !old) {
    if (requested) fail('Las recetas anteriores conservan su formato original. Emita una nueva receta para registrar peso y procedimientos');
    return null;
  }
  if (body.consultationVersion !== undefined && body.consultationVersion !== 1) fail('Versión de receta no válida');
  if (patientChanged && body.weight === undefined) fail('Al cambiar de paciente debe indicar o borrar expresamente el peso');
  const kg = body.weight === undefined ? old?.weightKg ?? null : weightKg(body.weight);
  if (body.procedures === undefined) return { kg, procedures: old?.procedures.map(({ subtotal, ...item }) => item) || [] };
  if (!Array.isArray(body.procedures) || body.procedures.length > 100) fail('La receta admite un máximo de 100 procedimientos');
  const seen = new Set(), procedures = [];
  for (const item of body.procedures) {
    const serviceId = String(item?.serviceId || '');
    if (!/^[1-9]\d*$/.test(serviceId) || seen.has(serviceId)) fail('Seleccione servicios válidos sin duplicarlos');
    seen.add(serviceId);
    const quantity = Number(item.quantity);
    if (!['string', 'number'].includes(typeof item.quantity) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) fail('La cantidad del procedimiento debe estar entre 1 y 1000');
    const saved = old?.procedures.find(procedure => procedure.serviceId === serviceId);
    if (saved) {
      procedures.push({ serviceId, name: saved.name, description: saved.description, unitPrice: saved.unitPrice, quantity });
    } else {
      const [rows] = await connection.query(`SELECT s.nombre, s.descripcion, s.precio_base FROM servicio s
        INNER JOIN categoria_servicio c ON c.categoria_servicio_id = s.categoria_servicio_id
        WHERE s.servicio_id = ? AND s.activo = 1 AND c.activo = 1 LIMIT 1`, [serviceId]);
      if (!rows.length) fail('El servicio seleccionado no está disponible');
      const price = Number(rows[0].precio_base);
      if (rows[0].precio_base === null || !Number.isFinite(price) || price < 0 || price > 99999999.99) fail('El precio del catálogo no es válido');
      procedures.push({ serviceId, name: rows[0].nombre, description: rows[0].descripcion || '', unitPrice: Math.round(price * 100) / 100, quantity });
    }
  }
  return { kg, procedures };
};
const save = async (connection, id, details) => {
  if (!details) return;
  await connection.query(`INSERT INTO receta_consulta (receta_id, peso_kg, procedimientos) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE peso_kg = VALUES(peso_kg), procedimientos = VALUES(procedimientos)`,
  [id, details.kg, JSON.stringify(details.procedures)]);
};
module.exports = { KG_PER_LB, available, weightKg, totals, readDetails, enrich, prepare, save };
