import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { transformSync } from 'esbuild';

let server, helpers, validation, submitBody;
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  helpers = await server.ssrLoadModule('/src/app/utils/groomingTransport.ts');
  validation = await server.ssrLoadModule('/src/app/utils/formValidation.ts');
  const source = await readFile(new URL('../pages/Grooming.tsx', import.meta.url), 'utf8');
  submitBody = transformSync(source.slice(source.indexOf('  const handleSubmit ='), source.indexOf('  const closeSuccessModal =')), { loader: 'ts' }).code;
});
test.after(async () => { await server?.close(); });

test('tres o cuatro mascotas de una ruta ocupan un cupo; las citas anteriores siguen siendo individuales', () => {
  assert.equal(helpers.countGroomingTransportRoutes([{ id: '1', routeId: '10' }, { id: '2', routeId: '10' }, { id: '3', routeId: '10' }]), 1);
  assert.equal(helpers.countGroomingTransportRoutes([{ id: '1', routeId: '10' }, { id: '2', routeId: '10' }, { id: '3', routeId: '10' }, { id: '4', routeId: '10' }, { id: '5', routeId: '11' }, { id: '6' }]), 3);
});

test('al editar una mascota secundaria carga el costo único de ruta sin confundirlo con cero', () => {
  assert.equal(helpers.groomingRouteCost({ routeId: '1', routeTransportCost: 30, transportCost: 0 }), 30);
  assert.equal(helpers.groomingRouteCost({ transportCost: 25 }), 25);
});

const form = { patientId: '1', petName: 'Mascota Uno', tutorFirstName: 'Ana', tutorFirstSurname: 'Lopez', tutorPhone: '55555555',
  type: 'Grooming con transporte', animalSize: 'Mediano', date: '2099-10-06', time: '09:00', age: '3 años', groomingCost: 100, transportCost: 30,
  address: 'Domicilio de prueba', paymentMethod: 'efectivo' };
const extra = { patientId: '2', animalSize: 'Pequeño', groomingCost: 75 };
function setup({ data = form, additional = [extra], editing = null, response = { ok: true, status: 201, data: { message: 'Guardado' } } } = {}) {
  const state = { requests: [], errors: [], saving: [], success: [], info: [] };
  const args = { formData: data, saving: false, additionalPets: additional, editingGrooming: editing,
    setFormError: error => { if (error) state.errors.push(error); }, setSaving: value => state.saving.push(value),
    ...Object.fromEntries(['isValidPetName', 'isValidName', 'isValidPhone', 'getTodayLocal', 'isValidAgeSpacing', 'isNonNegativeNumber'].map(key => [key, validation[key]])),
    isTransportType: type => type === 'Grooming con transporte', API_URL: '/api', getAuthHeaders: () => ({}),
    fetch: async (url, init) => { state.requests.push({ url, init }); return { ...response, json: async () => response.data }; },
    loadGrooming: async () => {}, setSuccessMessage: message => state.success.push(message), setShowSuccessModal() {}, setInfoModalType: value => state.info.push(value),
  };
  return { state, run: new Function(...Object.keys(args), `${submitBody}; return handleSubmit;`)(...Object.values(args)) };
}

test('el formulario envía una sola reserva atómica con cada mascota, costo y medio de pago', async () => {
  const { state, run } = setup(); await run({ preventDefault() {} });
  assert.equal(state.requests.length, 1); assert.equal(state.requests[0].init.method, 'POST');
  const payload = JSON.parse(state.requests[0].init.body);
  assert.deepEqual(payload.additionalPets, [extra]); assert.equal(payload.paymentMethod, 'efectivo');
  assert.equal(payload.transportCost, 30); assert.equal(payload.address, form.address);
  assert.deepEqual(state.saving, [true, false]); assert.equal(state.errors.length, 0);
});

test('editar una cita envía únicamente esa cita y no reprograma sus compañeras', async () => {
  const { state, run } = setup({ additional: [], editing: { id: '17' } }); await run({ preventDefault() {} });
  assert.equal(state.requests[0].url, '/api/grooming/17'); assert.equal(state.requests[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(state.requests[0].init.body).additionalPets, []);
});

test('exige el medio de pago al crear transporte y los datos individuales de mascotas adicionales', async () => {
  for (const options of [{ data: { ...form, paymentMethod: '' } }, { additional: [{ ...extra, groomingCost: '' }] }, { additional: [{ ...extra, animalSize: '' }] }]) {
    const { state, run } = setup(options); await run({ preventDefault() {} });
    assert.equal(state.requests.length, 0); assert.equal(state.errors.length, 1);
  }
});

test('un límite de rutas devuelto por el servidor conserva el formulario y libera el bloqueo de guardado', async () => {
  const { state, run } = setup({ response: { ok: false, status: 409, data: { code: 'TRANSPORT_LIMIT' } } }); await run({ preventDefault() {} });
  assert.deepEqual(state.info, ['transportLimit']); assert.deepEqual(state.saving, [true, false]);
  assert.equal(state.success.length, 0);
});

const unregistered = { patientId: '', clientId: 'local-key', petName: 'Nube Nueva', species: 'Perro', breed: 'Mestiza', age: '2 años', animalSize: 'Pequeño', groomingCost: 45 };
test('permite una principal nueva y hasta tres nuevas adicionales sin exigir expediente', async () => {
  const additional = [unregistered, { ...unregistered, clientId: 'next', petName: 'Otra Nueva', groomingCost: 65 }];
  const { state, run } = setup({ data: { ...form, patientId: '' }, additional }); await run({ preventDefault() {} });
  assert.equal(state.requests.length, 1);
  const payload = JSON.parse(state.requests[0].init.body);
  assert.equal(payload.patientId, ''); assert.equal(payload.additionalPets.length, 2);
  assert.deepEqual(payload.additionalPets.map(pet => pet.groomingCost), [45, 65]);
  assert(payload.additionalPets.every(pet => !('clientId' in pet)));
  assert.equal(payload.transportCost, 30);
});
test('reserva mixta conserva los identificadores registrados y los datos de mascotas nuevas', async () => {
  const { state, run } = setup({ additional: [extra, unregistered] }); await run({ preventDefault() {} });
  const payload = JSON.parse(state.requests[0].init.body);
  assert.equal(payload.additionalPets[0].patientId, '2'); assert.equal(payload.additionalPets[1].petName, 'Nube Nueva');
});
test('bloquea mascotas nuevas incompletas y más de cuatro mascotas antes de enviar', async () => {
  for (const changes of [{ petName: '' }, { species: '' }, { breed: '' }, { age: '' }, { age: '2años' }, { animalSize: '' }, { groomingCost: '' }]) {
    const { state, run } = setup({ additional: [{ ...unregistered, ...changes }] }); await run({ preventDefault() {} });
    assert.equal(state.requests.length, 0); assert.equal(state.errors.length, 1);
  }
  const { state, run } = setup({ additional: [unregistered, unregistered, unregistered, unregistered] }); await run({ preventDefault() {} });
  assert.equal(state.requests.length, 0); assert.equal(state.errors.length, 1);
});
