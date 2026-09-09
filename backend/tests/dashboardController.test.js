const test = require('node:test');
const assert = require('node:assert/strict');

const { buildUpcomingVaccinationReminders } = require('../src/controllers/dashboardController');

test('convierte vacunas próximas en recordatorios útiles para el dashboard', () => {
  const rows = [
    {
      paciente_id: 17,
      nombre_mascota: 'Luna',
      nombre_tutor: 'Ana Gómez',
      nombre_vacuna: 'Rabia',
      proxima_dosis: '2026-09-05',
      dias_restantes: 4,
    },
    {
      nombre_mascota: 'Max',
      nombre_tutor: 'Pedro Ruiz',
      nombre_vacuna: 'Moquillo',
      proxima_dosis: '2026-09-20',
      dias_restantes: 19,
    },
  ];

  const reminders = buildUpcomingVaccinationReminders(rows);

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].patientId, '17');
  assert.equal(reminders[0].tag, 'Vacuna');
  assert.equal(reminders[0].title, 'Luna');
  assert.match(reminders[0].description, /Rabia|en 4 días|Ana Gómez/i);
  assert.match(reminders[0].description, /05\/09\/2026/);
  assert.doesNotMatch(reminders[0].description, /2026-09-05/);
  assert.equal(reminders[0].tone, 'amber');
});
