import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { jsPDF } from 'jspdf';
import { createCanvas } from '@napi-rs/canvas';

let viteServer;
let preview;
const originalFetch = globalThis.fetch;

test.before(async () => {
  // Los recursos que Vite sirve por HTTP se leen del disco en esta prueba Node.
  globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/node_modules/pdfjs-dist/')) {
      const path = new URL(`.${url.split('?')[0]}`, new URL('../../../', import.meta.url));
      return new Response(await readFile(path));
    }
    return originalFetch(url, options);
  };
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  preview = await viteServer.ssrLoadModule('/src/app/utils/pdfPreview.ts');
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await viteServer?.close();
});

test('muestra texto, imágenes y todas las páginas de un PDF blob generado con jsPDF', async (t) => {
  const photo = createCanvas(20, 20);
  const photoContext = photo.getContext('2d');
  photoContext.fillStyle = '#ff0000';
  photoContext.fillRect(0, 0, 20, 20);

  const pdf = new jsPDF({ unit: 'pt', format: [300, 400] });
  pdf.setFont('times', 'bold');
  pdf.text('Paciente: Luna - Vacunación', 20, 30);
  pdf.addImage(photo.toBuffer('image/png'), 'PNG', 20, 60, 40, 40);
  pdf.addPage([400, 300], 'landscape');
  pdf.text('Receta médica - Página 2', 20, 30);
  pdf.setFillColor(0, 0, 255);
  pdf.rect(20, 60, 40, 40, 'F');

  const url = URL.createObjectURL(pdf.output('blob'));
  t.after(() => URL.revokeObjectURL(url));
  const loadingTask = await preview.createPdfPreviewTask(url);
  t.after(() => loadingTask.destroy());
  const document = await loadingTask.promise;
  assert.equal(document.numPages, 2);

  for (const pageNumber of [1, 2]) {
    const page = await document.getPage(pageNumber);
    const text = await page.getTextContent();
    assert.match(text.items.map((item) => item.str).join(' '), pageNumber === 1 ? /Luna/ : /Página 2/);
    const viewport = page.getViewport({ scale: 1 });
    assert.equal(viewport.width > viewport.height, pageNumber === 2);
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const pixel = context.getImageData(30, 70, 1, 1).data;
    assert.deepEqual([...pixel], pageNumber === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    // Verifica que el texto se dibujó, además de comprobar que puede extraerse.
    const textPixels = context.getImageData(20, 10, 200, 30).data;
    assert.ok(textPixels.some((value, index) => index % 4 !== 3 && value < 100));
  }
});

test('rechaza un archivo que no es PDF para que el visor muestre un error', async (t) => {
  const url = URL.createObjectURL(new Blob(['archivo inválido'], { type: 'application/pdf' }));
  t.after(() => URL.revokeObjectURL(url));
  const loadingTask = await preview.createPdfPreviewTask(url);
  t.after(() => loadingTask.destroy());
  await assert.rejects(loadingTask.promise, /Invalid PDF/);
});

test('ajusta páginas verticales y horizontales a teléfonos, tablets y escritorio con zoom limitado en memoria', async (t) => {
  const pdf = new jsPDF({ unit: 'pt', format: [300, 400] });
  pdf.setFillColor(255, 0, 0);
  pdf.rect(0, 0, 300, 400, 'F');
  pdf.addPage([400, 300], 'landscape');
  pdf.setFillColor(0, 0, 255);
  pdf.rect(0, 0, 400, 300, 'F');
  const url = URL.createObjectURL(pdf.output('blob'));
  t.after(() => URL.revokeObjectURL(url));
  const task = await preview.createPdfPreviewTask(url);
  t.after(() => task.destroy());
  const document = await task.promise;

  for (const pageNumber of [1, 2]) {
    const page = await document.getPage(pageNumber);
    for (const width of [280, 600, 820, 1200]) {
      const { viewport, pixelRatio } = preview.getPdfPreviewRenderSettings(page, width, 1, 3);
      assert.ok(Math.abs(viewport.width - width) < 0.01);
      const canvas = createCanvas(Math.ceil(viewport.width * pixelRatio), Math.ceil(viewport.height * pixelRatio));
      const context = canvas.getContext('2d');
      await page.render({ canvas, canvasContext: context, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }).promise;
      const pixel = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      assert.deepEqual([...pixel], pageNumber === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
      const enlarged = preview.getPdfPreviewRenderSettings(page, width, 3, 3);
      assert.ok(Math.abs(enlarged.viewport.width - width * 3) < 0.01);
      assert.ok(enlarged.viewport.width * enlarged.viewport.height * enlarged.pixelRatio ** 2 <= 8_000_001);
    }
  }
});

test('cancela la carga cuando se cierra la vista previa', async (t) => {
  const url = URL.createObjectURL(new jsPDF().output('blob'));
  t.after(() => URL.revokeObjectURL(url));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(preview.createPdfPreviewTask(url, controller.signal), { name: 'AbortError' });
});
