import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { transformSync } from 'esbuild';
import { jsPDF } from 'jspdf';
import { createCanvas } from '@napi-rs/canvas';

let server, utils, branding, clinical, preview, createPdf, logo;
const originalFetch = globalThis.fetch;
const output = new URL('../../../tmp/pdfs/recetas/', import.meta.url);
const patient = { id: '1', petName: 'Paciente de prueba', weight: 999 };
const legacy = { id: '7', patientId: '1', tutorName: 'Tutor de prueba', date: '2026-11-13',
  reason: 'Control de seguimiento', diagnosis: 'Diagnóstico de prueba', observations: 'Mantener indicaciones\nSeguimiento médico',
  medications: [{ productName: 'Medicamento de prueba', quantity: 2, instructions: 'Una dosis cada doce horas' }] };
const fixedDate = class extends Date { toLocaleString() { return '13/11/2026, 12:00'; } };
function generator(source) {
  const body = transformSync(source.slice(source.indexOf('  const getPatientByPrescription ='), source.indexOf('  const generatePDF =')), { loader: 'ts' }).code;
  return new Function('patients', 'jsPDF', 'getUnavetLogoBase64', 'drawUnavetPdfHeader', 'clinicalPdfLines', 'drawClinicalPdfLine',
    'prescriptionWeightText', 'drawPrescriptionProcedures', 'Date', `${body}; return createPrescriptionPDF;`)([patient], jsPDF,
    async () => logo, branding.drawUnavetPdfHeader, clinical.clinicalPdfLines, clinical.drawClinicalPdfLine,
    utils.prescriptionWeightText, utils.drawPrescriptionProcedures, fixedDate);
}
test.before(async () => {
  await mkdir(output, { recursive: true });
  logo = `data:image/png;base64,${(await readFile(new URL('../assets/unavet-logo.png', import.meta.url))).toString('base64')}`;
  globalThis.fetch = async (url, options) => typeof url === 'string' && url.startsWith('/@fs/')
    ? new Response(await readFile(url.slice(5).split('?')[0])) : typeof url === 'string' && url.startsWith('/node_modules/pdfjs-dist/')
      ? new Response(await readFile(new URL(`.${url.split('?')[0]}`, new URL('../../../', import.meta.url)))) : originalFetch(url, options);
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  utils = await server.ssrLoadModule('/src/app/utils/prescriptionConsultation.ts');
  branding = await server.ssrLoadModule('/src/app/utils/pdfBranding.ts');
  clinical = await server.ssrLoadModule('/src/app/utils/clinicalText.ts');
  preview = await server.ssrLoadModule('/src/app/utils/pdfPreview.ts');
  createPdf = generator(await readFile(new URL('../pages/Prescriptions.tsx', import.meta.url), 'utf8'));
});
test.after(async () => { globalThis.fetch = originalFetch; await server?.close(); });
test('conversión, equivalencia y totales sin errores de centavos', () => {
  assert.equal(utils.prescriptionWeightKg('22.0462262185', 'lb'), 10);
  assert.equal(utils.prescriptionWeightKg('10', 'kg'), 10);
  assert.equal(utils.prescriptionWeightKg('', 'kg'), null);
  assert.ok(Number.isNaN(utils.prescriptionWeightKg('-1', 'kg')));
  assert.equal(utils.prescriptionWeightText(10), '10 kg / 22.046226 lb');
  assert.equal(utils.prescriptionWeightText(null), 'No registrado');
  assert.equal(utils.procedureTotal([{ unitPrice: 0.1, quantity: 3 }, { unitPrice: 0.2, quantity: 1 }]), 0.5);
});
const pageHash = doc => createHash('sha256').update(JSON.stringify(doc.internal.pages.slice(1))).digest('hex');
test('PDF anterior conserva exactamente sus instrucciones de dibujo y no usa peso actual del paciente', async () => {
  const doc = await createPdf(legacy);
  // Huella de las fuentes de Recetas verificadas en producción, con reloj fijo.
  const expected = 'bf05ab82a8dba55644085154e6e0ed7bffca48960d1044cf486884509334dd6d';
  assert.equal(pageHash(doc), expected);
  patient.weight = 1234;
  assert.equal(pageHash(await createPdf(legacy)), expected);
  assert.equal(doc.getNumberOfPages(), 1);
});
async function inspect(doc, name) {
  await writeFile(new URL(`${name}.pdf`, output), Buffer.from(doc.output('arraybuffer')));
  const url = URL.createObjectURL(doc.output('blob'));
  const task = await preview.createPdfPreviewTask(url);
  try {
    const pdf = await task.promise; let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      assert.ok(content.items.some(item => item.str === 'UNAVET'), 'Cada página conserva el encabezado institucional');
      text += content.items.map(item => item.str).join(' ') + ' ';
      for (const item of content.items.filter(item => item.str.trim())) {
        const x = item.transform[4] * 25.4 / 72;
        assert.ok(x >= 14.8 && x + item.width * 25.4 / 72 <= 195.3, `Texto fuera del ancho: ${item.str}`);
      }
      const viewport = page.getViewport({ scale: 1.25 }), canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await writeFile(new URL(`${name}-${n}.png`, output), canvas.toBuffer('image/png'));
    }
    return text;
  } finally { await task.destroy(); URL.revokeObjectURL(url); }
}
test('PDF nuevo y vista previa incluyen peso, medicamentos, procedimientos, precios y total', async () => {
  const recipe = { ...legacy, consultationVersion: 1, weightKg: 10, procedures: [
    { serviceId: '1', name: 'Análisis A', description: 'Procedimiento de prueba A', quantity: 2, unitPrice: 123.45 },
    { serviceId: '2', name: 'Análisis B', description: 'Procedimiento de prueba B', quantity: 1, unitPrice: 67.89 },
  ] };
  const before = JSON.stringify(recipe), doc = await createPdf(recipe);
  const text = await inspect(doc, 'receta-peso-procedimientos');
  for (const value of ['UNAVET', '10 kg / 22.046226 lb', 'Medicamento de prueba', 'Una dosis cada doce horas', 'Análisis A', 'Análisis B',
    'Q 123.45', 'Q 246.90', 'Q 67.89', 'Q 314.79', 'Motivo de consulta', 'Observaciones']) assert.ok(text.includes(value), value);
  assert.equal(JSON.stringify(recipe), before);
  assert.equal(Object.keys(doc.internal.collections.addImage_images).length, 1);
});
test('procedimientos extensos se paginan sin perder descripción, totales ni indicaciones', async () => {
  const procedures = Array.from({ length: 20 }, (_, i) => ({ serviceId: String(i + 1), name: `Procedimiento ${i + 1}`,
    description: 'Descripción clínica detallada para el control del paciente. '.repeat(4), quantity: 1, unitPrice: 12.34 }));
  const doc = await createPdf({ ...legacy, consultationVersion: 1, weightKg: 0.25, procedures });
  const text = await inspect(doc, 'receta-varias-paginas');
  assert.ok(doc.getNumberOfPages() > 1);
  for (let n = 1; n <= 20; n++) assert.ok(text.includes(`Procedimiento ${n}`));
  assert.ok(text.includes('Q 246.80')); assert.ok(text.includes('Mantener indicaciones'));
});
test('el formulario conserva recetas antiguas y envía servicios sin precios ni cobros del cliente', async () => {
  const source = await readFile(new URL('../pages/Prescriptions.tsx', import.meta.url), 'utf8');
  assert.match(source, /catalogos\/servicios/);
  assert.match(source, /procedures: procedures.map\(item => \(\{ serviceId: item.serviceId, quantity: item.quantity \}\)\)/);
  assert.match(source, /supportsConsultation \? \{ consultationVersion: 1/);
  assert.match(source, /disabled=\{saving\}/);
  assert.ok(!/API_URL\}\/ventas/.test(source));
});

test('envío real del formulario: kg, lb, edición histórica y protección de doble clic', async () => {
  const source = await readFile(new URL('../pages/Prescriptions.tsx', import.meta.url), 'utf8');
  const body = transformSync(source.slice(source.indexOf('  const handleSubmit ='), source.indexOf('  const closeSuccessModal =')), { loader: 'ts' }).code;
  for (const mode of ['kg', 'lb', 'historical', 'saving']) {
    const calls = [], states = [], error = [];
    const scope = {
      saving: mode === 'saving', supportsConsultation: mode !== 'historical', currentWeightKg: 10,
      medications: legacy.medications, editingPrescription: mode === 'historical' ? legacy : null,
      formData: { patientId: '1', reason: 'Control', veterinarianId: '3' }, weightValue: mode === 'lb' ? '22.0462262185' : '10',
      weightUnit: mode === 'lb' ? 'lb' : 'kg', procedures: [{ serviceId: '2', quantity: 3, unitPrice: 123.45 }],
      API_URL: '/api', getAuthHeaders: () => ({ Authorization: 'test' }),
      fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: '9' }) }; },
      loadPrescriptions: async () => {}, loadInventory: async () => {},
      setSaving: value => states.push(value), setSuccessMessage: () => {}, setShowSuccessModal: () => {},
      setPrescriptionError: value => error.push(value), alert: value => error.push(value),
    };
    const submit = new Function(...Object.keys(scope), `${body};return handleSubmit;`)(...Object.values(scope));
    await submit({ preventDefault() {} });
    assert.deepEqual(error, []);
    if (mode === 'saving') { assert.equal(calls.length, 0); continue; }
    assert.equal(calls.length, 1); assert.deepEqual(states, [true, false]);
    const payload = JSON.parse(calls[0].options.body);
    assert.deepEqual(payload.medications, legacy.medications);
    if (mode === 'historical') {
      assert.equal(calls[0].options.method, 'PUT');
      assert.ok(!('weight' in payload) && !('procedures' in payload));
    } else {
      assert.equal(calls[0].options.method, 'POST');
      assert.equal(payload.weight.unit, mode);
      assert.deepEqual(payload.procedures, [{ serviceId: '2', quantity: 3 }]);
    }
  }
});
