const { createHash } = require('node:crypto');
const fail = (message, code = 'INVALID_TRANSPORT', statusCode = 400) => {
  throw Object.assign(new Error(message), { code, statusCode });
};
const normalizeAddress = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const money = value => {
  const number = Number(value);
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(number) || number < 0 || number > 99999999.99) fail('El costo debe ser un número válido mayor o igual a cero');
  return Math.round(number * 100) / 100;
};
const operationsAvailable = async connection => {
  const [rows] = await connection.query(`SELECT COUNT(*) AS grooming_operations_tables FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('grooming_operacion', 'grooming_transporte_ruta')`);
  return Number(rows[0]?.grooming_operations_tables) === 2;
};
const requireOperations = available => {
  if (!available) fail('La mejora de grooming requiere aplicar primero la migración de rutas y formas de pago', 'GROOMING_MIGRATION_REQUIRED', 503);
};
// Un orden de bloqueo único serializa reservas, reprogramaciones y reactivaciones.
// No se escriben horarios ni se introducen tablas de bloqueo.
const lockTransportSchedules = async connection => {
  await connection.query(`SELECT h.horario_id FROM horario_atencion h
    INNER JOIN modulo_sistema m ON m.modulo_id = h.modulo_id
    WHERE m.codigo = 'grooming' ORDER BY h.horario_id FOR UPDATE`);
};
const paymentId = async (connection, code, previous = null) => {
  if (code === undefined) return previous;
  if (!code) return null;
  const [rows] = await connection.query(`SELECT forma_pago_id FROM forma_pago
    WHERE codigo = ? AND (activo = 1 OR forma_pago_id = ?) LIMIT 1`, [code, previous]);
  if (!rows.length) fail('La forma de pago seleccionada no está disponible', 'INVALID_PAYMENT_METHOD');
  return rows[0].forma_pago_id;
};
const currentOperation = async (connection, id) => {
  const [rows] = await connection.query('SELECT forma_pago_id, ruta_id FROM grooming_operacion WHERE grooming_id = ?', [id]);
  return rows[0] || {};
};
const routeMembers = async (connection, routeId, excludeId = 0) => {
  const [rows] = await connection.query(`SELECT operacion.ruta_id, cita.grooming_id, cita.paciente_id, cita.nombre_mascota,
      estado.nombre AS estado, estado.es_cancelado
    FROM grooming_operacion operacion
    INNER JOIN cita_grooming cita ON cita.grooming_id = operacion.grooming_id
    INNER JOIN estado_grooming estado ON estado.estado_grooming_id = cita.estado_grooming_id
    WHERE operacion.ruta_id ${Array.isArray(routeId) ? 'IN (?)' : '= ?'} AND cita.grooming_id <> ? ORDER BY cita.grooming_id`, [routeId, excludeId]);
  return rows;
};
const resolveRoute = async (connection, { date, time, typeId, tutorId, address, cost, excludeId = 0, patientIds, active = true }) => {
  const normalized = normalizeAddress(address);
  if (!normalized || String(address).length > 255 || !tutorId) fail('Indique el tutor y una dirección de recogida válida');
  const amount = money(cost);
  const key = createHash('sha256').update(normalized).digest('hex');
  const [routes] = await connection.query(`SELECT ruta_id, costo FROM grooming_transporte_ruta
    WHERE fecha = ? AND hora = ? AND tutor_id = ? AND tipo_grooming_id = ? AND direccion_key = ? FOR UPDATE`,
  [date, time, tutorId, typeId, key]);
  const route = routes[0];
  const members = route ? await routeMembers(connection, route.ruta_id, excludeId) : [];
  const activeMembers = members.filter(member => !member.es_cancelado);
  if (active && activeMembers.length + patientIds.length > 4) fail('La ruta admite un máximo de cuatro mascotas activas', 'ROUTE_PET_LIMIT', 409);
  if (active && patientIds.some(id => id && activeMembers.some(member => String(member.paciente_id) === String(id)))) {
    fail('Una de las mascotas ya tiene una cita activa en esta ruta', 'DUPLICATE_PATIENT_ROUTE', 409);
  }
  if (active && !activeMembers.length) {
    const [counts] = await connection.query(`SELECT COUNT(DISTINCT CASE WHEN operacion.ruta_id IS NULL
        THEN CONCAT('cita-', cita.grooming_id) ELSE CONCAT('ruta-', operacion.ruta_id) END) AS route_count
      FROM cita_grooming cita
      INNER JOIN estado_grooming estado ON estado.estado_grooming_id = cita.estado_grooming_id
      LEFT JOIN grooming_operacion operacion ON operacion.grooming_id = cita.grooming_id
      WHERE cita.fecha = ? AND cita.tipo_grooming_id = ? AND estado.es_cancelado = 0 AND cita.grooming_id <> ?`, [date, typeId, excludeId]);
    const [capacities] = await connection.query(`SELECT h.capacidad_diaria FROM horario_atencion h
      INNER JOIN modulo_sistema m ON m.modulo_id = h.modulo_id
      WHERE m.codigo = 'grooming' AND h.dia_semana = DAYOFWEEK(?) - 1
        AND h.tipo_grooming_id = ? AND h.activo = 1 LIMIT 1`, [date, typeId]);
    const capacity = Number(capacities[0]?.capacidad_diaria || 0);
    if (capacity <= 0 || Number(counts[0].route_count) >= capacity) fail('Ya se alcanzó el límite diario de rutas de transporte', 'TRANSPORT_LIMIT', 409);
  }
  if (route) {
    if (money(route.costo) !== amount) {
      if (members.length) fail(`La ruta compartida ya tiene un costo de Q${money(route.costo).toFixed(2)}. Conserve ese importe.`, 'SHARED_ROUTE_COST', 409);
      await connection.query('UPDATE grooming_transporte_ruta SET costo = ? WHERE ruta_id = ?', [amount, route.ruta_id]);
    }
    return route.ruta_id;
  }
  const [result] = await connection.query(`INSERT INTO grooming_transporte_ruta
    (tutor_id, tipo_grooming_id, fecha, hora, direccion, direccion_key, costo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [tutorId, typeId, date, time, String(address).trim(), key, amount]);
  return result.insertId;
};
const saveOperation = async (connection, id, methodId, routeId) => {
  await connection.query(`INSERT INTO grooming_operacion (grooming_id, forma_pago_id, ruta_id) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE forma_pago_id = VALUES(forma_pago_id), ruta_id = VALUES(ruta_id)`, [id, methodId, routeId]);
};
const enrichAppointments = async (connection, appointments) => {
  if (!appointments.length || !(await operationsAvailable(connection))) return appointments;
  const [rows] = await connection.query(`SELECT operacion.grooming_id, operacion.ruta_id, pago.codigo, pago.nombre,
      ruta.costo AS costo_ruta FROM grooming_operacion operacion
    LEFT JOIN forma_pago pago ON pago.forma_pago_id = operacion.forma_pago_id
    LEFT JOIN grooming_transporte_ruta ruta ON ruta.ruta_id = operacion.ruta_id
    WHERE operacion.grooming_id IN (?)`, [appointments.map(item => item.id)]);
  const routes = new Map();
  const routeIds = [...new Set(rows.filter(row => row.ruta_id).map(row => String(row.ruta_id)))];
  for (const member of routeIds.length ? await routeMembers(connection, routeIds) : []) {
    const id = String(member.ruta_id);
    if (!routes.has(id)) routes.set(id, []);
    routes.get(id).push(member);
  }
  const byId = new Map(rows.map(row => [String(row.grooming_id), row]));
  return appointments.map(item => {
    const row = byId.get(item.id);
    if (!row) return item; // El objeto de una cita anterior queda intacto.
    const members = routes.get(String(row.ruta_id)) || [];
    const charge = members.find(member => !member.es_cancelado);
    return { ...item, paymentMethod: row.codigo || '', paymentMethodName: row.nombre || '',
      routeId: row.ruta_id ? String(row.ruta_id) : null,
      ...(row.ruta_id ? {
        routeTransportCost: Number(row.costo_ruta),
        transportCost: String(charge?.grooming_id) === item.id ? Number(row.costo_ruta) : 0,
        routeMembers: members.map(member => ({ id: String(member.grooming_id), patientId: member.paciente_id ? String(member.paciente_id) : '',
          petName: member.nombre_mascota, status: member.estado, isCancelled: Boolean(member.es_cancelado) })),
      } : {}),
    };
  });
};

module.exports = { fail, money, normalizeAddress, operationsAvailable, requireOperations, lockTransportSchedules,
  paymentId, currentOperation, resolveRoute, saveOperation, enrichAppointments };
