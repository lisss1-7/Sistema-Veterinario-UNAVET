const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isFutureDateTime,
  isTodayOrFuture,
} = require('../src/utils/inputValidation');

test('rechaza horarios anteriores o iguales a la hora actual de Guatemala', () => {
  const now = new Date('2026-09-26T22:00:30-06:00');

  assert.equal(isFutureDateTime('2026-09-26', '10:00', now), false);
  assert.equal(isFutureDateTime('2026-09-26', '22:00', now), false);
});

test('acepta horarios posteriores del mismo día y de días futuros', () => {
  const now = new Date('2026-09-26T16:00:00-06:00');

  assert.equal(isFutureDateTime('2026-09-26', '16:30', now), true);
  assert.equal(isFutureDateTime('2026-09-27', '08:00', now), true);
});

test('calcula el día de la clínica con la zona horaria de Guatemala', () => {
  const now = new Date('2026-09-27T04:30:00Z');

  assert.equal(isFutureDateTime('2026-09-26', '23:00', now), true);
  assert.equal(isFutureDateTime('2026-09-26', '22:00', now), false);
  assert.equal(isTodayOrFuture('2026-09-26', now), true);
});

test('rechaza fechas y horas con formato inválido', () => {
  const now = new Date('2026-09-26T16:00:00-06:00');

  assert.equal(isFutureDateTime('2026-02-30', '17:00', now), false);
  assert.equal(isFutureDateTime('2026-09-26', '25:00', now), false);
  assert.equal(isFutureDateTime('', '', now), false);
});
