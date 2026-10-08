import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { jsPDF } from 'jspdf';
import { PDFDocument, PDFArray, degrees, decodePDFRawStream } from 'pdf-lib';

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

const toPdfDataUrl = (bytes) => `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;

const pageContents = (document, page) => {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  return streams.map((stream) => Buffer.from(decodePDFRawStream(document.context.lookup(stream)).decode()));
};

const createLaboratoryPdf = async () => {
  const document = await PDFDocument.create();
  for (let index = 0; index < 3; index += 1) {
    const page = document.addPage(index === 1 ? [792, 612] : [612, 792]);
    page.drawText(`Resultado de laboratorio - pagina ${index + 1}`, { x: 30, y: 100 });
    if (index === 2) page.setRotation(degrees(90));
  }
  return document.save();
};

test('anexa las tres páginas del laboratorio después de toda la ficha, conservando contenido, tamaños y rotación', async () => {
  const base = new jsPDF();
  base.text('Ficha del tratamiento', 16, 30);
  base.addPage();
  base.text('Observaciones del tratamiento', 16, 30);
  const baseBlob = base.output('blob');
  const laboratoryBytes = await createLaboratoryPdf();
  const result = await attachment.appendTreatmentPdfAttachment(baseBlob, toPdfDataUrl(laboratoryBytes));
  assert.equal(result.type, 'application/pdf');
  const merged = await PDFDocument.load(await result.arrayBuffer());
  const originals = [
    await PDFDocument.load(await baseBlob.arrayBuffer()),
    await PDFDocument.load(laboratoryBytes),
  ];
  assert.equal(merged.getPageCount(), 5);
  let index = 0;
  for (const original of originals) {
    for (const page of original.getPages()) {
      const mergedPage = merged.getPage(index++);
      assert.deepEqual(mergedPage.getSize(), page.getSize());
      assert.deepEqual(mergedPage.getRotation(), page.getRotation());
      assert.deepEqual(pageContents(merged, mergedPage), pageContents(original, page));
    }
  }
});

test('obtiene y fusiona el PDF desde el enlace firmado usado por el almacenamiento actual', async (context) => {
  const bytes = await createLaboratoryPdf();
  const reference = 'media/treatments/00000000-0000-0000-0000-000000000000.pdf?expires=123&signature=test';
  const fetchMock = context.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.endsWith(`/${reference}`));
    return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
  });
  const merged = await attachment.appendTreatmentPdfAttachment(new jsPDF().output('blob'), reference);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal((await PDFDocument.load(await merged.arrayBuffer())).getPageCount(), 4);
});

test('conserva intacto el PDF generado cuando no hay adjunto o ya contiene una imagen', async () => {
  const base = new jsPDF();
  // PNG de un píxel: debe seguir dentro del documento sin pasar por la fusión de PDF.
  base.addImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'PNG', 16, 30, 80, 60);
  const blob = base.output('blob');
  for (const value of [undefined, '', 'data:image/jpeg;base64,test', 'media/treatments/image.png?signature=test', 'media/treatments/image.webp?signature=test']) {
    assert.equal(await attachment.appendTreatmentPdfAttachment(blob, value), blob);
  }
});

test('avisa si el PDF adjunto no está disponible en lugar de generar un archivo incompleto', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  await assert.rejects(
    attachment.appendTreatmentPdfAttachment(new jsPDF().output('blob'), 'media/treatments/result.pdf?signature=expired'),
    /No fue posible anexar el PDF adjunto/
  );
});

test('rechaza adjuntos PDF dañados o cifrados sin omitir silenciosamente sus páginas', async () => {
  const base = new jsPDF().output('blob');
  await assert.rejects(attachment.appendTreatmentPdfAttachment(base, toPdfDataUrl('contenido inválido')), /No fue posible anexar/);
  const encrypted = await PDFDocument.create();
  encrypted.addPage();
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({}));
  await assert.rejects(
    attachment.appendTreatmentPdfAttachment(base, toPdfDataUrl(await encrypted.save())),
    /no tenga contraseña/
  );
});
