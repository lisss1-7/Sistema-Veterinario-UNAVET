import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { transformSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCanvas } from '@napi-rs/canvas';

let vite, createPdf, preview, Details, exportBody;
const output = new URL('../../../tmp/sales-closing-pdf/', import.meta.url);
const originalFetch = globalThis.fetch;
const logo = createCanvas(20, 20).toDataURL('image/png');
const sale = {
  id: '42', date: '2026-10-16', client: 'Cliente de prueba', invoiceNit: 'CF', invoiceName: 'Nombre de prueba', total: 100,
  payments: [{ code: 'cash', name: 'Efectivo', amount: 60 }, { code: 'retired', name: 'Forma histórica', amount: 40 }],
  items: [{ type: 'Producto', description: 'Producto de prueba', quantity: 2, unitPrice: 50, subtotal: 100 }],
};
const report = { date: sale.date, sales: [sale, { ...sale, id: '43', total: 999, canceled: true, cancellationReason: 'Error de registro' }], shifts: [{ number: 1, label: 'Mañana', responsible: 'Responsable de prueba', closedAt: '2026-10-16T18:00:00Z', summary: { total: 120, saleCount: 2, productQuantity: 3, payments: [{ name: 'Efectivo', amount: 120 }] } }], isDayClosed: true, generatedAt: new Date('2026-10-16T19:20:00Z') };

test.before(async () => {
  await mkdir(output, { recursive: true });
  globalThis.fetch = async (url, options) => typeof url === 'string' && url.startsWith('/node_modules/pdfjs-dist/')
    ? new Response(await readFile(new URL(`.${url.split('?')[0]}`, new URL('../../../', import.meta.url)))) : originalFetch(url, options);
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  createPdf = (await vite.ssrLoadModule('/src/app/utils/salesClosingPdf.ts')).createSalesClosingPdf;
  preview = await vite.ssrLoadModule('/src/app/utils/pdfPreview.ts');
  Details = (await vite.ssrLoadModule('/src/app/components/SaleDetailsModal.tsx')).default;
  const source = await readFile(new URL('../components/SalesClosing.tsx', import.meta.url), 'utf8');
  exportBody = transformSync(source.slice(source.indexOf('  const previewSalesPdf ='), source.indexOf('  const downloadPreview =')), { loader: 'ts' }).code;
});
test.after(async () => { globalThis.fetch = originalFetch; await vite?.close(); });

async function inspectPdf(doc, name, t) {
  await writeFile(new URL(`${name}.pdf`, output), Buffer.from(doc.output('arraybuffer')));
  const url = URL.createObjectURL(doc.output('blob')); t.after(() => URL.revokeObjectURL(url));
  const task = await preview.createPdfPreviewTask(url); t.after(() => task.destroy());
  const pdf = await task.promise; let text = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + ' ';
    for (const item of content.items.filter(item => item.str.trim())) {
      const x = item.transform[4] * 25.4 / 72, y = (page.view[3] - item.transform[5]) * 25.4 / 72;
      if (y < 40 || y > 275) continue;
      assert.ok(x >= 15.9 && x + item.width * 25.4 / 72 <= 194.5, `Fuera del ancho: ${item.str}`);
      assert.ok(y <= 267.1, `Fuera del cuerpo: ${item.str}`);
    }
    const viewport = page.getViewport({ scale: 1.3 }), canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    await writeFile(new URL(`${name}-${n}.png`, output), canvas.toBuffer('image/png'));
  }
  return { text, pages: pdf.numPages };
}

test('cierre conserva pagos históricos, distingue anulaciones y snapshots de turno', async t => {
  const before = JSON.stringify(report);
  const { text } = await inspectPdf(createPdf(report, logo), 'dia', t);
  assert.match(text, /Total vigente: Q 100\.00/); assert.match(text, /Forma histórica: Q 40\.00/);
  assert.match(text, /Ventas vigentes: 1 \| Anuladas: 1/); assert.match(text, /Unidades de productos vendidas: 2/);
  assert.match(text, /Total: Q 120\.00/); assert.match(text, /ANULADA/); assert.match(text, /Error de registro/);
  assert.equal(JSON.stringify(report), before);
});

test('día abierto sin ventas genera un reporte válido de cero', async t => {
  const { text } = await inspectPdf(createPdf({ ...report, sales: [], shifts: [], isDayClosed: false }, logo), 'vacio', t);
  assert.match(text, /Abierta - resumen/); assert.match(text, /Total vigente: Q 0\.00/); assert.match(text, /No hay ventas registradas/);
});

test('venta individual con descripción extensa y muchos conceptos conserva todas las páginas', async t => {
  const longSale = { ...sale, total: 5600, payments: [{ code: 'cash', name: 'Efectivo', amount: 5600 }], client: 'Nombre extenso '.repeat(35), items: [
    { ...sale.items[0], description: 'Descripción extensa del producto con presentación y recomendaciones. '.repeat(190) + ' FIN DESCRIPCIÓN' },
    ...Array.from({ length: 55 }, (_, index) => ({ ...sale.items[0], description: `Concepto ${index + 1}` })),
  ] };
  const { text, pages } = await inspectPdf(createPdf({ ...report, sales: [longSale], shifts: [], mode: 'sale' }, logo), 'venta-extensa', t);
  assert.ok(pages > 3); assert.match(text, /FIN DESCRIPCIÓN/); assert.match(text, /Concepto 55/);
  assert.match(text, /Detalle de venta #42/); assert.doesNotMatch(text, /Turnos cerrados/);
});

test('ficha de venta muestra cantidades, pagos, NIT y estado sin acciones de escritura', () => {
  const html = renderToStaticMarkup(createElement(Details, { sale: { ...sale, canceled: true, cancellationReason: 'Prueba' }, onClose() {}, onPdf() {}, pdfBusy: false }));
  for (const value of ['Detalle de venta #42', 'Producto de prueba', 'Cantidad', 'Subtotal', 'Forma histórica', 'Factura NIT', 'Anulada', 'Vista previa PDF']) assert.ok(html.includes(value));
  assert.ok(!html.includes('Anular venta')); assert.ok(!html.includes('Registrar venta'));
});

function exporter(responses) {
  const state = { notices: [], documents: [], previews: [], methods: [] };
  const mockFetch = async (url, init) => {
    state.methods.push(init.method || 'GET');
    assert.equal(init.cache, 'no-store');
    const key = url.includes('/estado?') ? 'day' : url.includes('/turnos?') ? 'shifts' : 'sales';
    return { ok: responses[key].ok !== false, json: async () => responses[key].data };
  };
  const make = new Function('fetch', 'API_URL', 'date', 'getAuthHeaders', 'pdfGeneration', 'setPdfBusy', 'getUnavetLogoBase64', 'createSalesClosingPdf', 'setPdfPreview', 'setNotice', `${exportBody}; return previewSalesPdf;`);
  return { state, run: make(mockFetch, '/api', sale.date, () => ({}), { current: 0 }, () => {}, async () => logo,
    data => { state.documents.push(data); return { output: () => new Blob(['pdf']) }; }, value => state.previews.push(value), value => state.notices.push(value)) };
}

test('exportación vuelve a leer la venta y el estado actuales mediante GET', async () => {
  const { state, run } = exporter({ sales: { data: [{ ...sale, total: 150 }] }, day: { data: { isClosed: true } }, shifts: { data: { shifts: [] } } });
  await run(sale);
  assert.equal(state.documents[0].sales[0].total, 150); assert.equal(state.documents[0].isDayClosed, true);
  assert.deepEqual(state.methods, ['GET', 'GET', 'GET']);
  state.previews.forEach(value => URL.revokeObjectURL(value.url));
});

test('consulta fallida o venta eliminada impide generar un PDF engañoso', async () => {
  for (const sales of [{ ok: false, data: { message: 'Error de consulta' } }, { data: [] }]) {
    const { state, run } = exporter({ sales, day: { data: { isClosed: false } }, shifts: { data: { shifts: [] } } });
    await run(sale); assert.equal(state.documents.length, 0); assert.equal(state.previews.length, 0); assert.equal(state.notices.length, 1);
  }
});
