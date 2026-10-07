import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let viteServer;
let detectReportType;
let filterReportData;
test.before(async () => {
  viteServer = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ detectReportType, filterReportData } = await viteServer.ssrLoadModule('/src/app/utils/aiReportRequest.ts'));
});
test.after(async () => { await viteServer?.close(); });

const now = new Date(2026, 9, 7, 12);
const data = (module, records) => ({ patients: [], appointments: [], grooming: [], inventory: [], prescriptions: [], vaccinations: [], treatments: [], [module]: records });

test('reconoce solicitudes escritas y prioriza vacunación y recetas sobre palabras secundarias', () => {
  const cases = {
    'Informe general': 'general',
    'Muéstrame las citas de la clínica pendientes': 'appointments',
    'Pacientes con vacunas vencidas': 'vaccinations',
    'Recetas con medicamentos surtidos desde inventario': 'prescriptions',
    'Cuántos perros están registrados': 'patients',
    'Qué productos necesito reponer': 'inventory',
    'Compara las citas y la peluquería': 'general',
    'Ahora por estado': null,
  };
  for (const [prompt, expected] of Object.entries(cases)) assert.equal(detectReportType(prompt), expected, prompt);
});

test('citas pendientes de este mes filtra fecha y estado sin modificar los datos originales', () => {
  const source = data('appointments', [
    { id: 1, date: '2026-10-01', status: 'Pendiente' },
    { id: 2, date: '2026-10-31', status: 'Pendiente' },
    { id: 3, date: '2026-09-30', status: 'Pendiente' },
    { id: 4, date: '2026-10-07', status: 'Confirmada' },
  ]);
  const result = filterReportData('Citas pendientes de este mes', 'appointments', source, now);
  assert.deepEqual(result.data.appointments.map(({ id }) => id), [1, 2]);
  assert.equal(source.appointments.length, 4);
  assert.match(result.scope.join('; '), /2026-10-01 a 2026-10-31/);
});

test('acepta rangos escritos, fechas relativas y meses con año', () => {
  const source = data('appointments', [
    { id: 1, date: '2026-09-30' }, { id: 2, date: '2026-10-06' }, { id: 3, date: '2026-10-07' }, { id: 4, date: '2026-10-08' },
  ]);
  const selected = (prompt) => filterReportData(prompt, 'appointments', source, now).data.appointments.map(({ id }) => id);
  assert.deepEqual(selected('Citas entre 06/10/2026 y 07/10/2026'), [2, 3]);
  assert.deepEqual(selected('Citas de hoy'), [3]);
  assert.deepEqual(selected('Citas de ayer'), [2]);
  assert.deepEqual(selected('Citas de mañana'), [4]);
  assert.deepEqual(selected('Citas de septiembre de 2026'), [1]);
  assert.deepEqual(selected('Citas del mes pasado'), [1]);
  assert.deepEqual(selected('Citas de los últimos 2 días'), [2, 3]);
  assert.equal(selected('Citas por mes').length, 4);
});

test('un estado sin coincidencias produce datos vacíos y las negaciones excluyen el estado', () => {
  const source = data('appointments', [{ status: 'Confirmada' }, { status: 'Cancelada' }]);
  assert.deepEqual(filterReportData('Citas pendientes', 'appointments', source, now).data.appointments, []);
  assert.deepEqual(filterReportData('Citas no canceladas', 'appointments', source, now).data.appointments, [{ status: 'Confirmada' }]);
});

test('usa especies y razas reales de la API y acepta sinónimos de perro y gato', () => {
  const source = data('patients', [
    { id: 1, species: 'Canino', breed: 'Labrador' }, { id: 2, species: 'Felino', breed: 'Siamés' }, { id: 3, species: 'Canino', breed: 'Mestizo' },
  ]);
  const selected = (prompt) => filterReportData(prompt, 'patients', source, now).data.patients.map(({ id }) => id);
  assert.deepEqual(selected('Pacientes caninos por raza'), [1, 3]);
  assert.deepEqual(selected('Pacientes de raza Labrador'), [1]);
  assert.deepEqual(selected('Cuántos gatos hay'), [2]);
  assert.deepEqual(filterReportData('Pacientes felinos', 'patients', data('patients', [{ species: 'Canino' }]), now).data.patients, []);
});

test('vacunaciones pendientes filtra por próxima dosis usando los estados existentes', () => {
  const source = data('vaccinations', [
    { id: 1, status: 'Próxima dosis', nextDose: '2026-10-07', applicationDate: '2026-09-07' },
    { id: 2, status: 'Completado', nextDose: '2026-10-07' },
    { id: 3, status: 'Vencida', nextDose: '2026-09-07' },
  ]);
  assert.deepEqual(filterReportData('Vacunas pendientes de hoy', 'vaccinations', source, now).data.vaccinations.map(({ id }) => id), [1]);
});

test('existencias bajas y productos agotados usan cantidades reales', () => {
  const source = data('inventory', [
    { name: 'A', currentStock: 0, minStock: 2 }, { name: 'B', currentStock: 2, minStock: 2 }, { name: 'C', currentStock: 3, minStock: 2 },
  ]);
  assert.equal(filterReportData('Existencias bajas', 'inventory', source, now).data.inventory.length, 2);
  assert.equal(filterReportData('Productos agotados', 'inventory', source, now).data.inventory.length, 1);
});

test('filtra por nombre y rechaza fechas inválidas en lugar de generar otro alcance', () => {
  const source = data('appointments', [{ petName: 'Firulais' }, { petName: 'Luna' }]);
  assert.deepEqual(filterReportData('Citas de Firulais', 'appointments', source, now).data.appointments, [{ petName: 'Firulais' }]);
  assert.throws(() => filterReportData('Citas del 30/02/2026', 'appointments', source, now), /fecha inválida/);
  assert.throws(() => filterReportData('Citas entre 2026-10-08 y 2026-10-01', 'appointments', source, now), /fecha inicial/);
  assert.throws(() => filterReportData('Inventario de hoy', 'inventory', data('inventory', []), now), /fecha de vencimiento/);
});

test('los reportes predeterminados de servicios conservan todos sus tipos', () => {
  const treatments = data('treatments', [{ type: 'Tratamiento', category: 'Tratamiento' }, { type: 'Servicio', category: 'Servicio' }, { type: 'Prueba', category: 'Laboratorio' }]);
  assert.equal(filterReportData('Tratamientos y servicios', 'treatments', treatments, now).data.treatments.length, 3);
  const grooming = data('grooming', [{ type: 'Peluquería y aseo' }, { type: 'Transporte' }]);
  assert.equal(filterReportData('Peluquería y aseo', 'grooming', grooming, now).data.grooming.length, 2);
});
