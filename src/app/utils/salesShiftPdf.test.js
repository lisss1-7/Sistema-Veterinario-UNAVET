import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { transformSync } from 'esbuild';
import { createCanvas } from '@napi-rs/canvas';

let server, createPdf, preview, title, exportBody, logo;
const output = new URL('../../../tmp/sales-shift-pdf/', import.meta.url);
const originalFetch = globalThis.fetch;
const daytime = {
  id: '7', number: 1, label: 'Diurno', afterSaleId: '100', throughSaleId: '125',
  closedAt: '2026-11-13T19:00:00Z', responsible: 'Responsable del turno diurno',
  summary: { accountingVersion: 2, shiftDocumentVersion: 1, shiftPeriod: 'diurno', total: 120,
    cashFundTotal: 200, receivedTotal: 320, saleCount: 1, productQuantity: 2, payments: [{ name: 'Efectivo', amount: 120 }],
    paymentBreakdown: [{ code: 'efectivo', name: 'Efectivo', salesAmount: 120, cashFundAmount: 200, receivedAmount: 320 }] },
};
const nighttime = {
  ...daytime, id: '8', number: 2, label: 'Nocturno', afterSaleId: '125', throughSaleId: '150',
  closedAt: '2026-11-14T05:00:00Z', responsible: 'Responsable del turno nocturno',
  summary: { accountingVersion: 2, shiftDocumentVersion: 1, shiftPeriod: 'nocturno', total: 75,
    cashFundTotal: 50, receivedTotal: 125, saleCount: 1, productQuantity: 0, payments: [{ name: 'Transferencia BI', amount: 75 }],
    paymentBreakdown: [
      { code: 'efectivo', name: 'Efectivo', salesAmount: 0, cashFundAmount: 50, receivedAmount: 50 },
      { code: 'transferencia_bi', name: 'Transferencia BI', salesAmount: 75, cashFundAmount: 0, receivedAmount: 75 },
    ] },
};
const report = shift => ({ date: '2026-11-13', shift, generatedAt: new Date('2026-11-14T05:01:00Z') });

test.before(async () => {
  await mkdir(output, { recursive: true });
  logo = `data:image/png;base64,${(await readFile(new URL('../assets/unavet-logo.png', import.meta.url))).toString('base64')}`;
  globalThis.fetch = async (url, options) => typeof url === 'string' && url.startsWith('/@fs/')
    ? new Response(await readFile(url.slice(5).split('?')[0])) : typeof url === 'string' && url.startsWith('/node_modules/pdfjs-dist/')
      ? new Response(await readFile(new URL(`.${url.split('?')[0]}`, new URL('../../../', import.meta.url)))) : originalFetch(url, options);
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const module = await server.ssrLoadModule('/src/app/utils/salesShiftPdf.ts');
  createPdf = module.createSalesShiftPdf; title = module.salesShiftTitle;
  preview = await server.ssrLoadModule('/src/app/utils/pdfPreview.ts');
  const source = await readFile(new URL('../components/SalesClosing.tsx', import.meta.url), 'utf8');
  exportBody = transformSync(source.slice(source.indexOf('  const previewShiftPdf ='), source.indexOf('  const documentUnavailable =')), { loader: 'ts' }).code;
});
test.after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

async function inspect(doc, name, t) {
  assert.ok(doc.getNumberOfPages() <= 2);
  await writeFile(new URL(`${name}.pdf`, output), Buffer.from(doc.output('arraybuffer')));
  const url = URL.createObjectURL(doc.output('blob')); t.after(() => URL.revokeObjectURL(url));
  const task = await preview.createPdfPreviewTask(url); t.after(() => task.destroy());
  const pdf = await task.promise;
  let text = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + ' ';
    for (const item of content.items.filter(item => item.str.trim())) {
      const x = item.transform[4] * 25.4 / 72, y = (page.view[3] - item.transform[5]) * 25.4 / 72;
      if (y < 40 || y > 275) continue;
      assert.ok(x >= 15.9 && x + item.width * 25.4 / 72 <= 194.5, `Fuera del ancho: ${item.str}`);
      assert.ok(y <= 264.1, `Fuera del cuerpo: ${item.str}`);
    }
    const viewport = page.getViewport({ scale: 1.3 }), canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    await writeFile(new URL(`${name}-${n}.png`, output), canvas.toBuffer('image/png'));
  }
  return { text, pages: pdf.numPages };
}

test('Diurno: logo, responsable y todos los importes en una página sin alterar el snapshot', async t => {
  const before = JSON.stringify(daytime);
  const doc = createPdf(report(daytime), logo);
  assert.equal(Object.keys(doc.internal.collections.addImage_images).length, 1);
  const { text, pages } = await inspect(doc, 'diurno', t);
  assert.equal(pages, 1);
  for (const value of ['UNAVET', 'Turno Diurno', '13/11/2026', daytime.responsible, 'Ingresos por ventas', 'Fondos agregados', 'Total recibido', 'Q 120.00', 'Q 200.00', 'Q 320.00', 'Ventas realizadas: 1', 'Efectivo']) assert.ok(text.includes(value), value);
  assert.equal(JSON.stringify(daytime), before);
});

test('Nocturno: resumen independiente con fondos recibidos en efectivo y ventas por transferencia', async t => {
  const before = JSON.stringify(nighttime);
  const { text, pages } = await inspect(createPdf(report(nighttime), logo), 'nocturno', t);
  assert.equal(pages, 1);
  for (const value of ['Turno Nocturno', nighttime.responsible, 'Q 75.00', 'Q 50.00', 'Q 125.00', 'Efectivo', 'Transferencia BI']) assert.ok(text.includes(value), value);
  assert.ok(!text.includes('Q 320.00'));
  assert.equal(JSON.stringify(nighttime), before);
});

test('miles de ventas no agregan tablas ni páginas al resumen', () => {
  const doc = createPdf(report({ ...daytime, summary: { ...daytime.summary, saleCount: 50000, productQuantity: 100000 } }), logo);
  assert.equal(doc.getNumberOfPages(), 1);
});

test('nombres extensos y múltiples formas de pago se conservan en un máximo de dos páginas', async t => {
  const count = 18;
  const paymentBreakdown = Array.from({ length: count }, (_, index) => ({ code: `forma-${index}`, name: `Forma ${index + 1} - transferencia bancaria con referencia de la institución veterinaria`, salesAmount: 10, cashFundAmount: 5, receivedAmount: 15 }));
  const shift = { ...daytime, label: 'Caja principal y recepción de servicios veterinarios', responsible: 'Nombre del responsable '.repeat(8), summary: { ...daytime.summary,
    total: 180, cashFundTotal: 90, receivedTotal: 270, paymentBreakdown } };
  const { text, pages } = await inspect(createPdf(report(shift), logo), 'dos-paginas', t);
  assert.equal(pages, 2);
  for (let n = 1; n <= count; n++) assert.ok(text.includes(`Forma ${n} -`));
  assert.ok(text.includes('Q 270.00'));
});

test('un desglose excepcionalmente grande nunca produce un documento mayor de dos páginas ni se recorta', () => {
  const paymentBreakdown = Array.from({ length: 200 }, (_, index) => ({ code: String(index), name: `Forma ${index}`, salesAmount: 1, cashFundAmount: 1, receivedAmount: 2 }));
  assert.throws(() => createPdf(report({ ...daytime, summary: { ...daytime.summary, total: 200, cashFundTotal: 200, receivedTotal: 400, paymentBreakdown } }), logo), /dos páginas/);
});

test('cierres antiguos y del parche anterior conservan sus documentos sin reconversión', () => {
  for (const summary of [{ total: 320 }, { ...daytime.summary, shiftDocumentVersion: undefined }]) {
    const old = { ...daytime, label: 'Turno histórico original', summary };
    assert.equal(title(old), old.label);
    assert.throws(() => createPdf(report(old), logo), /formato anterior/);
  }
});

test('rechaza importes inconsistentes sin reconstruir el cierre guardado', () => {
  const shift = { ...daytime, summary: { ...daytime.summary, total: 999 } };
  const before = JSON.stringify(shift);
  assert.throws(() => createPdf(report(shift), logo), /no coincide/);
  assert.equal(JSON.stringify(shift), before);
});

function exporter(response) {
  const state = { requests: [], documents: [], previews: [], notices: [] };
  const make = new Function('fetch', 'API_URL', 'date', 'getAuthHeaders', 'pdfGeneration', 'setPdfBusy', 'getUnavetLogoBase64', 'createSalesShiftPdf', 'setPdfPreview', 'setNotice', 'salesShiftTitle', `${exportBody}; return previewShiftPdf;`);
  const run = make(async (url, init) => { state.requests.push({ url, init }); return { ok: response.ok !== false, json: async () => response.data }; }, '/api', '2026-11-13', () => ({}), { current: 0 }, () => {}, async () => logo,
    data => { state.documents.push(data); return { output: () => new Blob(['pdf']) }; }, value => state.previews.push(value), value => state.notices.push(value), title);
  return { state, run };
}

test('el botón consulta únicamente el turno guardado por GET y descarta el estado antiguo de la pantalla', async () => {
  const { state, run } = exporter({ data: { shifts: [daytime] } });
  await run({ ...daytime, summary: { ...daytime.summary, total: 999 } });
  assert.deepEqual(state.documents, [{ date: '2026-11-13', shift: daytime }]);
  assert.equal(state.requests.length, 1);
  assert.ok(state.requests[0].url.includes('/turnos?'));
  assert.equal(state.requests[0].init.method || 'GET', 'GET');
  assert.equal(state.requests[0].init.cache, 'no-store');
  state.previews.forEach(value => URL.revokeObjectURL(value.url));
});

test('consulta fallida o turno ausente impide exportar un PDF engañoso', async () => {
  for (const response of [{ ok: false, data: { message: 'Consulta fallida' } }, { data: { shifts: [] } }, { data: {} }]) {
    const { state, run } = exporter(response); await run(daytime);
    assert.equal(state.documents.length, 0); assert.equal(state.previews.length, 0); assert.equal(state.notices.length, 1);
  }
});
