import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { jsPDF } from 'jspdf';

let viteServer;
let attachment;
const previousFileReader = globalThis.FileReader;

test.before(async () => {
  // Simula la API FileReader del navegador; el módulo probado se carga con Vite.
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onload?.();
      }).catch(() => this.onerror?.());
    }
  };
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  attachment = await viteServer.ssrLoadModule('/src/app/utils/treatmentAttachment.ts');
});

test.after(async () => {
  if (previousFileReader === undefined) delete globalThis.FileReader;
  else globalThis.FileReader = previousFileReader;
  await viteServer?.close();
});

test('carga un PDF con MIME vacío y conserva sus bytes para la vista previa y descarga', async () => {
  const doc = new jsPDF();
  doc.text('Resultado de laboratorio de prueba', 10, 10);
  const bytes = doc.output('arraybuffer');
  const dataUrl = await attachment.readTreatmentAttachment(new File([bytes], 'resultado.PDF'));
  assert.ok(dataUrl.startsWith('data:application/pdf;base64,'));
  assert.equal(attachment.isPdfAttachment(dataUrl), true);
  const blob = await attachment.loadPdfAttachment(dataUrl);
  assert.equal(blob.type, 'application/pdf');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(bytes));
});

test('distingue PDF firmados y fotografías sin confundir los parámetros del enlace', () => {
  assert.equal(attachment.isPdfAttachment('media/treatments/id.pdf?expires=123&signature=test'), true);
  assert.equal(attachment.isPdfAttachment('media/treatments/id.jpg?name=archivo.pdf'), false);
  assert.equal(attachment.isPdfAttachment('data:image/png;base64,test'), false);
});

test('rechaza archivos falsos, formatos no admitidos y PDF mayores de 5 MB', async () => {
  await assert.rejects(attachment.readTreatmentAttachment(new File(['image-content'], 'falso.pdf')), /PDF válido/);
  await assert.rejects(attachment.readTreatmentAttachment(new File(['text'], 'archivo.txt', { type: 'text/plain' })), /imagen válida/);
  await assert.rejects(attachment.readTreatmentAttachment(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.pdf')), /5 MB/);
});
