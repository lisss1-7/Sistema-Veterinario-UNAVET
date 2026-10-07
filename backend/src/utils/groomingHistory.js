const sincronizarHistorialDesdeGrooming = async (connection, groomingId) => {
  const [appointments] = await connection.query(
    `SELECT cita.paciente_id, cita.fecha, cita.hora, cita.observaciones,
            cita.creado_por, tipo.nombre AS tipo, estado.nombre AS estado
     FROM cita_grooming cita
     INNER JOIN tipo_grooming tipo ON tipo.tipo_grooming_id = cita.tipo_grooming_id
     INNER JOIN estado_grooming estado ON estado.estado_grooming_id = cita.estado_grooming_id
     WHERE cita.grooming_id = ? LIMIT 1`,
    [groomingId]
  );
  const cita = appointments[0];
  if (!cita || !cita.paciente_id || cita.estado.toLocaleLowerCase('es') === 'cancelada') {
    await connection.query(
      `DELETE FROM historial_clinico
       WHERE grooming_id = ? AND origen = 'Grooming' AND estado_clinico = 'Pendiente'
         AND veterinario_id IS NULL AND diagnostico IS NULL AND tratamiento IS NULL`,
      [groomingId]
    );
    return;
  }

  const [records] = await connection.query(
    `SELECT historial_id, origen, veterinario_id, diagnostico, tratamiento
     FROM historial_clinico WHERE grooming_id = ? LIMIT 1`,
    [groomingId]
  );
  const existing = records[0];
  // Preserve clinical information entered by a veterinarian.
  if (existing && (existing.origen !== 'Grooming' || existing.veterinario_id ||
    existing.diagnostico || existing.tratamiento)) return;

  const observations = [
    `Grooming programado para las ${String(cita.hora).slice(0, 5)}. Estado actual: ${cita.estado}.`,
    cita.observaciones,
  ].filter(Boolean).join('\n');
  const status = cita.estado.toLocaleLowerCase('es') === 'completada' ? 'Completado' : 'Pendiente';
  if (existing) {
    await connection.query(
      `UPDATE historial_clinico
       SET paciente_id = ?, fecha = ?, motivo_consulta = ?, observaciones = ?, estado_clinico = ?
       WHERE historial_id = ? AND origen = 'Grooming'`,
      [cita.paciente_id, cita.fecha, cita.tipo, observations, status, existing.historial_id]
    );
    return;
  }

  await connection.query(
    `INSERT INTO historial_clinico
       (paciente_id, grooming_id, fecha, tipo_consulta_id, motivo_consulta,
        observaciones, origen, estado_clinico, creado_por)
     VALUES (?, ?, ?,
       (SELECT tipo_consulta_id FROM tipo_consulta WHERE nombre = 'Grooming programado' LIMIT 1),
       ?, ?, 'Grooming', ?, ?)`,
    [cita.paciente_id, groomingId, cita.fecha, cita.tipo, observations, status, cita.creado_por || null]
  );
};

module.exports = { sincronizarHistorialDesdeGrooming };
