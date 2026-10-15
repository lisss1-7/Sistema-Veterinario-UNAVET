import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
import { createServer } from 'vite';
import { jsPDF } from 'jspdf';
import { createCanvas } from '@napi-rs/canvas';

let vite, preview, createClinicalPdf, createClinicalHistoryPdf, createPrescriptionPDF, clinicalText;
const originalFetch = globalThis.fetch;
const output = new URL('../../../tmp/clinical-pdf-fix/qa/', import.meta.url);
test.before(async () => {
  await mkdir(output, { recursive: true });
  globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/node_modules/pdfjs-dist/')) return new Response(await readFile(new URL(`.${url.split('?')[0]}`, new URL('../../../', import.meta.url))));
    return originalFetch(url, options);
  };
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  preview = await vite.ssrLoadModule('/src/app/utils/pdfPreview.ts');
  const branding = await vite.ssrLoadModule('/src/app/utils/pdfBranding.ts');
  clinicalText = await vite.ssrLoadModule('/src/app/utils/clinicalText.ts');
  const source = await readFile(new URL('../pages/PatientDetail.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const createPdfBase = async'), source.indexOf('  const createSingleVaccinationPdf'));
  const code = transformSync(`function make() { ${body} return createClinicalPdf; }`, { loader: 'ts' }).code;
  const logo = `data:image/png;base64,${(await readFile(new URL('../assets/unavet-logo.png', import.meta.url))).toString('base64')}`;
  createClinicalPdf = new Function('jsPDF', 'patient', 'getUnavetLogoBase64', 'drawUnavetPdfHeader', 'formatDateForDisplay', 'clinicalPdfLines', 'drawClinicalPdfLine', `${code};return make();`)(jsPDF, {petName:'Paciente de prueba',species:'Felino',breed:'Mestizo',tutorName:'Tutor de prueba',tutorPhone:'55501001'},async()=>logo,branding.drawUnavetPdfHeader,value=>value,clinicalText.clinicalPdfLines,clinicalText.drawClinicalPdfLine);
  const historyBody = source.slice(source.indexOf('  const createPdfBase = async'),source.indexOf('  const createVaccinationPdf ='));
  const historyCode = transformSync(`function make() { ${historyBody} return createClinicalHistoryPdf; }`,{loader:'ts'}).code;
  const makeHistory = new Function('jsPDF','patient','getUnavetLogoBase64','drawUnavetPdfHeader','clinicalPdfLines','drawClinicalPdfLine','clinicalRecords',`${historyCode};return make();`);
  createClinicalHistoryPdf = records=>makeHistory(jsPDF,{petName:'Paciente de prueba'},async()=>logo,branding.drawUnavetPdfHeader,clinicalText.clinicalPdfLines,clinicalText.drawClinicalPdfLine,records)();
  const prescriptionSource = await readFile(new URL('../pages/Prescriptions.tsx', import.meta.url), 'utf8');
  const prescriptionBody = prescriptionSource.slice(prescriptionSource.indexOf('  const drawPdfFooter ='), prescriptionSource.indexOf('  const generatePDF ='));
  const prescriptionCode = transformSync(`function make() { ${prescriptionBody} return createPrescriptionPDF; }`, { loader: 'ts' }).code;
  createPrescriptionPDF = new Function('jsPDF', 'getPatientByPrescription', 'getUnavetLogoBase64', 'drawUnavetPdfHeader', 'clinicalPdfLines', 'drawClinicalPdfLine', `${prescriptionCode};return make();`)(jsPDF,()=>({petName:'Paciente de prueba'}),async()=>logo,branding.drawUnavetPdfHeader,clinicalText.clinicalPdfLines,clinicalText.drawClinicalPdfLine);
});
test.after(async () => { globalThis.fetch = originalFetch; await vite?.close(); });

const paragraph = 'Texto clínico de prueba con síntomas, evaluación y seguimiento. ';
for (const [name, record] of [
  ['normal', {reason:'Consulta de seguimiento.',diagnosis:paragraph.repeat(30),treatment:'Tratamiento final visible sin superposición.',observations:'Primera observación.\n- Segunda observación.'}],
  ['multipagina', {reason:paragraph.repeat(80),diagnosis:paragraph.repeat(150),treatment:paragraph.repeat(100)+' FIN DEL TRATAMIENTO'}],
  ['vacio', {}],
  ['receta', {sourceType:'prescription',prescriptionStatus:'Activa',reason:paragraph.repeat(35),diagnosis:paragraph.repeat(30),treatment:paragraph.repeat(70)+' FIN DE INDICACIONES',observations:'Observaciones de prueba.'}],
]) test(`PDF clínico ${name}: contenido completo, sin superposición ni atribución del personal`, async t => {
  const doc = await createClinicalPdf({date:'2026-10-13',consultationType:'Consulta general',veterinarian:'NOMBRE INTERNO VETERINARIO',createdByName:'NOMBRE INTERNO REGISTRADOR',...record});
  const bytes = doc.output('arraybuffer');
  await writeFile(new URL(`${name}.pdf`, output), Buffer.from(bytes));
  const url = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  t.after(()=>URL.revokeObjectURL(url));
  const task = await preview.createPdfPreviewTask(url); t.after(()=>task.destroy());
  const pdf = await task.promise;
  if(name==='multipagina') assert.ok(pdf.numPages>3);
  let text='';
  for(let n=1;n<=pdf.numPages;n++) {
    const page=await pdf.getPage(n), content=await page.getTextContent();
    text += content.items.map(i=>i.str).join(' ')+' ';
    const yValues = new Set();
    for(const item of content.items.filter(i=>i.str?.trim())) {
      const y=(page.view[3]-item.transform[5])*25.4/72;
      if(y<(n===1?95:42)||y>270)continue;
      assert.ok(y<=260.1,`Text outside body: ${y}`);
      yValues.add(Math.round(y*100)/100);
    }
    const baselines=[...yValues].sort((a,b)=>a-b);
    for(let i=1;i<baselines.length;i++) assert.ok(baselines[i]-baselines[i-1]>=4.9,`Overlapping lines: ${baselines[i-1]} / ${baselines[i]}`);
    const viewport=page.getViewport({scale:1.3}), canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
    await writeFile(new URL(`${name}-${n}.png`,output),canvas.toBuffer('image/png'));
  }
  assert.doesNotMatch(text,/NOMBRE INTERNO|Atendido por|Registro creado por|Registrado por|Veterinario/);
  assert.match(text,name==='receta'?/Medicamentos e indicaciones/:/Tratamiento indicado/);
  if(name==='normal')assert.match(text,/Tratamiento final visible sin superposición/);
  if(name==='normal') { assert.match(text, /Primera observación/); assert.match(text, /Segunda observación/); }
  if(name==='multipagina')assert.match(text,/FIN DEL TRATAMIENTO/);
  if(name==='receta')assert.match(text,/FIN DE INDICACIONES/);
});

test('justificación alcanza ambos márgenes, conserva última línea y sangría de guiones', async () => {
  const doc = new jsPDF(); doc.setFontSize(10);
  const width = 178, x = 16;
  const lines = clinicalText.clinicalPdfLines(doc, paragraph.repeat(8), width, true);
  const calls = [];
  const draw = doc.text.bind(doc);
  doc.text = (text, tx, ty, ...rest) => { calls.push({text, x:tx, y:ty});return draw(text,tx,ty,...rest); };
  lines.forEach((line,index)=>clinicalText.drawClinicalPdfLine(doc,line,x,40+index*5,width,true));
  assert.equal(calls.filter(call=>call.text==='-').length,1);
  for(let i=0;i<lines.length-1;i++) {
    const row=calls.filter(call=>call.y===40+i*5 && call.text!=='-');
    assert.ok(Math.abs(row[0].x-20)<.01);
    const last=row.at(-1);
    assert.ok(Math.abs(last.x+doc.getTextWidth(last.text)-194)<.01);
  }
  const final=calls.filter(call=>call.y===40+(lines.length-1)*5);
  assert.equal(final.length,1);
  assert.deepEqual(clinicalText.observationParagraphs('Uno\n- Dos\r\n• Tres\n\n'),['Uno','Dos','Tres']);
});

test('receta multipágina mantiene diagnóstico opcional y observaciones con guiones', async t => {
  const doc = await createPrescriptionPDF({date:'2026-10-14',tutorName:'Tutor de prueba',medications:[],reason:paragraph.repeat(25),diagnosis:'',observations:paragraph.repeat(70)+' FIN OBSERVACIÓN\n- Segunda observación'});
  const bytes=doc.output('arraybuffer');
  await writeFile(new URL('receta-justificada.pdf',output),Buffer.from(bytes));
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));t.after(()=>URL.revokeObjectURL(url));
  const task=await preview.createPdfPreviewTask(url);t.after(()=>task.destroy());const pdf=await task.promise;
  assert.ok(pdf.numPages>=3);
  let text='',bullets=0;
  for(let n=1;n<=pdf.numPages;n++) {
    const page=await pdf.getPage(n),content=await page.getTextContent();
    text+=content.items.map(item=>item.str).join(' ')+' ';
    bullets+=content.items.filter(item=>item.str==='-').length;
    for(const item of content.items.filter(item=>item.str.trim())) {
      const y=(page.view[3]-item.transform[5])*25.4/72;
      if(y>=43&&y<275)assert.ok(y<=255.1);
    }
    const viewport=page.getViewport({scale:1.3}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
    await writeFile(new URL(`receta-justificada-${n}.png`,output),canvas.toBuffer('image/png'));
  }
  assert.equal(bullets,2);assert.match(text,/FIN OBSERVACIÓN/);assert.match(text,/Segunda observación/);
  assert.doesNotMatch(text,/Diagnóstico/);
});

test('historial completo conserva columnas y contenido al justificar varias páginas',async t=>{
  const doc=await createClinicalHistoryPdf([{date:'2026-10-14',consultationType:'Consulta general',sourceType:'prescription',prescriptionStatus:'Activa',reason:paragraph.repeat(20)+' FIN MOTIVO',diagnosis:paragraph.repeat(35)+' FIN DIAGNÓSTICO',treatment:paragraph.repeat(40)+' FIN TRATAMIENTO'}]);
  const url=URL.createObjectURL(new Blob([doc.output('arraybuffer')],{type:'application/pdf'}));t.after(()=>URL.revokeObjectURL(url));
  const task=await preview.createPdfPreviewTask(url);t.after(()=>task.destroy());const pdf=await task.promise;
  let text='';assert.ok(pdf.numPages>1);
  for(let n=1;n<=pdf.numPages;n++) {
    const page=await pdf.getPage(n),content=await page.getTextContent();
    text+=content.items.map(item=>item.str).join(' ')+' ';
    for(const item of content.items.filter(item=>item.str.trim())) {
      const y=(page.view[3]-item.transform[5])*25.4/72;
      if(y<43 || y>270)continue;
      const x=item.transform[4]*25.4/72;
      assert.ok(x>=15.9 && x+item.width*25.4/72<=194.2,`Fuera de márgenes: ${item.str}`);
    }
  }
  assert.match(text,/FIN MOTIVO/);assert.match(text,/FIN DIAGNÓSTICO/);assert.match(text,/FIN TRATAMIENTO/);
});
