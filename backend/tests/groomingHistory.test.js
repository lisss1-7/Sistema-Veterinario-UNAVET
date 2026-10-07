const test = require('node:test');
const assert = require('node:assert/strict');
const { sincronizarHistorialDesdeGrooming } = require('../src/utils/groomingHistory');

const appointment = {
  paciente_id: 4, fecha: '2099-10-05', hora: '09:30:00',
  tipo: 'Grooming en clínica', estado: 'Pendiente',
  observaciones: 'Usar champú especial', creado_por: 3,
};

const connectionFor = (cita, records = []) => {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      if (sql.includes('FROM cita_grooming cita')) return [[cita].filter(Boolean)];
      if (sql.includes('SELECT historial_id')) return [records];
      writes.push({ sql, params });
      return [{ insertId: 10, affectedRows: 1 }];
    },
  };
};

test('crea el historial del paciente con hora, tipo, observaciones y autor', async () => {
  const connection = connectionFor(appointment);
  await sincronizarHistorialDesdeGrooming(connection, 12);
  const [write] = connection.writes;
  assert.match(write.sql, /INSERT INTO historial_clinico/);
  assert.deepEqual(write.params, [4, 12, '2099-10-05', 'Grooming en clínica',
    'Grooming programado para las 09:30. Estado actual: Pendiente.\nUsar champú especial', 'Pendiente', 3]);
});

test('reprograma y completa el registro existente sin duplicarlo', async () => {
  const connection = connectionFor({ ...appointment, fecha: '2099-10-06', estado: 'Completada' },
    [{ historial_id: 10, origen: 'Grooming' }]);
  await sincronizarHistorialDesdeGrooming(connection, 12);
  assert.equal(connection.writes.length, 1);
  assert.match(connection.writes[0].sql, /UPDATE historial_clinico/);
  assert.equal(connection.writes[0].params[1], '2099-10-06');
  assert.equal(connection.writes[0].params[4], 'Completado');
  assert.equal(connection.writes[0].params[5], 10);
});

for (const [label, cita] of [
  ['sin paciente', { ...appointment, paciente_id: null }],
  ['cancelada', { ...appointment, estado: 'Cancelada' }],
]) {
  test(`la cita ${label} solo retira el historial automático pendiente`, async () => {
    const connection = connectionFor(cita);
    await sincronizarHistorialDesdeGrooming(connection, 12);
    assert.equal(connection.writes.length, 1);
    assert.match(connection.writes[0].sql, /DELETE FROM historial_clinico/);
    assert.match(connection.writes[0].sql, /estado_clinico = 'Pendiente'/);
    assert.match(connection.writes[0].sql, /veterinario_id IS NULL/);
    assert.deepEqual(connection.writes[0].params, [12]);
  });
}

test('respeta la información clínica ingresada en el historial', async () => {
  const connection = connectionFor(appointment,
    [{ historial_id: 10, origen: 'Grooming', veterinario_id: 2, diagnostico: 'Dermatitis' }]);
  await sincronizarHistorialDesdeGrooming(connection, 12);
  assert.deepEqual(connection.writes, []);
});
