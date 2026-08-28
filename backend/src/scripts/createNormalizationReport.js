const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const output = path.join(__dirname, '../../backups/Informe_cambios_normalizacion_UNAVET.docx');
const zipOutput = `${output}.zip`;
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unavet-docx-'));

const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const run = (text, options = {}) => {
  const props = [
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>',
    options.bold ? '<w:b/>' : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
  ].join('');
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};

const paragraph = (text, style = 'Normal', options = {}) => {
  const pPr = [
    `<w:pStyle w:val="${style}"/>`,
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    options.keep ? '<w:keepNext/>' : '',
    options.before || options.after
      ? `<w:spacing w:before="${options.before || 0}" w:after="${options.after || 0}" w:line="${options.line || 300}" w:lineRule="auto"/>`
      : '',
    options.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
  ].join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${run(text, options)}</w:p>`;
};

const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

const table = (headers, rows, widths) => {
  const cell = (text, width, header = false, first = false) => `
    <w:tc>
      <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? '<w:shd w:fill="E8D9C5"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>
      ${paragraph(text, 'TableText', { bold: header || first, color: header ? '3D2E1F' : undefined, size: header ? 19 : 18 })}
    </w:tc>`;
  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map((h, i) => cell(h, widths[i], true)).join('')}</w:tr>`;
  const bodyRows = rows.map(row => `<w:tr>${row.map((value, i) => cell(value, widths[i], false, i === 0)).join('')}</w:tr>`).join('');
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblInd w:w="120" w:type="dxa"/><w:tblLayout w:type="fixed"/>
      <w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>
      <w:tblBorders><w:top w:val="single" w:sz="4" w:color="D8D2C8"/><w:left w:val="single" w:sz="4" w:color="D8D2C8"/><w:bottom w:val="single" w:sz="4" w:color="D8D2C8"/><w:right w:val="single" w:sz="4" w:color="D8D2C8"/><w:insideH w:val="single" w:sz="4" w:color="D8D2C8"/><w:insideV w:val="single" w:sz="4" w:color="D8D2C8"/></w:tblBorders>
    </w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`;
};

const p = (text) => paragraph(text);
const h1 = (text) => paragraph(text, 'Heading1', { keep: true });
const h2 = (text) => paragraph(text, 'Heading2', { keep: true });
const bullet = (text) => paragraph(text, 'ListParagraph', { num: true });

const body = [];
body.push(paragraph('INFORME TÉCNICO', 'Kicker', { align: 'center', color: '7B5B42', bold: true, size: 20, after: 700 }));
body.push(paragraph('Cambios principales realizados durante la normalización de la base de datos', 'CoverTitle', { align: 'center', bold: true, color: '3D2E1F', size: 52, after: 240 }));
body.push(paragraph('Sistema de gestión veterinaria UNAVET', 'CoverSubtitle', { align: 'center', color: '7B5B42', size: 30, after: 720 }));
body.push(paragraph('Comparación de la estructura anterior y la estructura normalizada', 'CoverMeta', { align: 'center', color: '6B5B4D', size: 22, after: 1100 }));
body.push(paragraph('Base analizada: unavet_db', 'CoverMeta', { align: 'center', bold: true, size: 21, after: 80 }));
body.push(paragraph('Respaldo anterior: 24 de julio de 2026', 'CoverMeta', { align: 'center', color: '6B5B4D', size: 21, after: 80 }));
body.push(paragraph('Documento elaborado: agosto de 2026', 'CoverMeta', { align: 'center', color: '6B5B4D', size: 21 }));
body.push(pageBreak());

body.push(h1('1. Resumen ejecutivo'));
body.push(p('Antes de la normalización, el respaldo disponible contenía 10 tablas operativas. En ellas se almacenaban juntos datos de pacientes, tutores, citas, inventario, recetas, vacunaciones y ventas. Varios valores se repetían como texto y algunas relaciones dependían de nombres escritos manualmente.'));
body.push(p('La normalización reorganizó esos datos en entidades especializadas, catálogos y tablas de relación. La base actual tiene 57 tablas después de retirar tres tablas auxiliares sustituidas por lógica de aplicación. El aumento no representa duplicación: refleja una separación más precisa de responsabilidades.'));
body.push(table(
  ['Indicador', 'Antes', 'Después'],
  [
    ['Cantidad de tablas', '10 tablas en el respaldo original', '57 tablas activas'],
    ['Datos repetidos', 'Nombres, estados, razas y pagos como texto', 'Identificadores y catálogos reutilizables'],
    ['Personas', 'Datos del tutor copiados en diferentes registros', 'Tutores, usuarios y veterinarios separados'],
    ['Inventario', 'Stock total dentro del producto', 'Lotes, movimientos y trazabilidad'],
    ['Integridad', 'Relaciones principalmente implícitas', 'Llaves foráneas, índices y validaciones'],
  ], [2700, 3330, 3330]
));
body.push(h1('2. Punto de partida'));
body.push(p('El respaldo anterior a la normalización contiene estas 10 tablas:'));
['cierres_ventas y cierre_ventas_detalle.', 'citas_clinicas y citas_grooming.', 'pacientes e historial_clinico.', 'tratamientos_servicios y vacunaciones.', 'receta_medicamentos y productos_inventario.'].forEach(x => body.push(bullet(x)));
body.push(paragraph('Nota metodológica: el respaldo conserva los datos, pero no los CREATE TABLE originales. La comparación se construyó con sus columnas, los scripts de migración y la estructura vigente.', 'Note'));
body.push(pageBreak());

body.push(h1('3. Cambios principales'));
body.push(table(
  ['Área', 'Antes de normalizar', 'Después de normalizar'],
  [
    ['Pacientes y tutores', 'Pacientes mezclaba información de la mascota con datos del tutor y valores descriptivos.', 'Se crearon tutores, especies, razas, sexos y estados_reproductivos; pacientes conserva referencias.'],
    ['Citas clínicas', 'Se repetían nombre del tutor, raza, tamaño, estado y otros textos.', 'Estados y tamaños se volvieron catálogos; las citas se relacionan con pacientes, tutores y horarios.'],
    ['Grooming', 'Tipo, modalidad, estado y recogida estaban concentrados en citas_grooming.', 'Se incorporaron tipos_grooming, estados_grooming, tamanos_animales y horarios_atencion.'],
    ['Inventario', 'El producto guardaba stock, proveedor, unidad y estado directamente.', 'Se separaron proveedores, categorías, unidades, estados, lotes y movimientos.'],
    ['Ventas', 'Había una columna diferente por cada medio de pago.', 'formas_pago y venta_pagos admiten nuevas modalidades sin cambiar la tabla de cierres.'],
    ['Recetas', 'Solo existía receta_medicamentos y varios valores eran texto.', 'Se separaron recetas, medicamentos, estados, modos de entrega y asignaciones de lotes.'],
    ['Vacunación', 'Cada registro mezclaba vacuna, dosis, intervalo y seguimiento.', 'Se separaron catálogo, esquema, aplicaciones, estados y unidades de intervalo.'],
    ['Seguridad', 'No había una estructura completa de permisos por módulo.', 'roles, modulos_sistema y rol_permisos controlan acciones por perfil.'],
  ], [2100, 3480, 3780]
));
body.push(pageBreak());

body.push(h1('4. Ejemplos representativos'));
body.push(h2('4.1 Paciente y tutor'));
body.push(p('Antes, nombre_tutor y telefono_tutor podían repetirse en cada cita. Ahora el tutor se registra una sola vez en tutores; pacientes y citas utilizan tutor_id. Esto reduce inconsistencias cuando cambia un teléfono o una dirección.'));
body.push(h2('4.2 Inventario por lotes'));
body.push(p('Antes, stock_actual y fecha_vencimiento estaban en productos_inventario. Después, lotes_producto permite varios lotes con vencimientos diferentes. movimientos_inventario conserva entradas, salidas y ajustes; venta_detalle_lotes y receta_medicamento_lotes identifican de qué lote salió cada unidad.'));
body.push(h2('4.3 Formas de pago'));
body.push(p('El diseño anterior incluía transferencia_bi, transferencia_ba, tarjeta_bac, tarjeta_bi y efectivo. Agregar un banco requería cambiar la tabla. Con formas_pago y venta_pagos, cada pago es una fila relacionada con la venta.'));
body.push(h2('4.4 Expediente clínico'));
body.push(p('El expediente se amplió con tipos_consulta, veterinarios, parametros_examen_fisico e historial_examen_fisico. Los parámetros se almacenan como registros comparables en lugar de depender de campos aislados o texto libre.'));
body.push(h2('4.5 Recetas y vacunación'));
body.push(p('Las recetas ahora cuentan con encabezado, medicamentos, estado y modo de entrega. Las vacunas se dividen entre el esquema previsto y las aplicaciones realizadas, separando planificación, ejecución e inventario consumido.'));

body.push(pageBreak());
body.push(h1('5. Relación con las formas normales'));
body.push(p('Primera forma normal (1FN). Se eliminaron grupos repetidos y columnas que representaban variantes del mismo dato. El ejemplo principal es reemplazar varias columnas de pago por filas en venta_pagos.'));
body.push(p('Segunda forma normal (2FN). Los datos se ubicaron en la entidad a la que pertenecen: la información del tutor en tutores y la información de cada lote en lotes_producto.'));
body.push(p('Tercera forma normal (3FN). Se redujeron dependencias entre atributos no clave. Estados, categorías, especies, razas, unidades y tipos se almacenan en catálogos y se referencian por identificador.'));

body.push(h1('6. Beneficios obtenidos'));
['Menor duplicación y mayor consistencia de nombres, estados y categorías.', 'Actualizaciones más seguras porque cada dato se mantiene en un lugar definido.', 'Trazabilidad de inventario, ventas, recetas, vacunaciones y responsables.', 'Validación de relaciones mediante llaves foráneas.', 'Crecimiento sin agregar columnas para cada nueva opción.'].forEach(x => body.push(bullet(x)));
body.push(h1('7. Consideraciones'));
body.push(p('Una base normalizada requiere más JOIN para construir algunas pantallas y reportes. También exige mantener catálogos y relaciones correctamente. En este proyecto, ese costo se compensa con una estructura más clara, reutilizable y auditable.'));
body.push(p('La cifra actual de 57 tablas incluye tablas funcionales, catálogos, relaciones y trazabilidad. Tres tablas auxiliares se retiraron posteriormente porque su comportamiento se resolvió en código: password_reset_tokens, notificaciones_descartadas y reportes_ia.'));
body.push(h1('8. Conclusión'));
body.push(p('La normalización transformó una estructura inicial compacta, pero con datos repetidos y responsabilidades mezcladas, en un modelo relacional más detallado. Los cambios separaron personas, catálogos, operaciones clínicas, inventario, pagos y permisos. El resultado facilita la integridad de los datos y el crecimiento del sistema UNAVET.'));
body.push(pageBreak());
body.push(h1('Fuentes técnicas revisadas'));
[
  'before-normalization-2026-07-24T01-24-55-554Z.json: respaldo de las 10 tablas anteriores.',
  'unavet_db_antes_normalizacion_consulta.sql: reconstrucción legible de la estructura anterior.',
  'unavet_db_estructura_antes_comments_20260727T124752Z.sql: estructura normalizada anterior a los comentarios.',
  'Scripts normalizeBusinessData.js, normalizeCatalogReferences.js, normalizeClinicalPeopleAndDates.js, normalizeClinicalModules.js, normalizeInventoryLots.js, normalizeRemainingIntegrity.js y normalizeStructuralIntegrity.js.',
].forEach(x => body.push(bullet(x)));

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:titlePg/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/><w:cols w:space="720"/></w:sectPr></w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="200"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="3D2E1F"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="140"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="7B5B42"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="240"/><w:spacing w:before="80" w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="6B5B4D"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:ind w:left="540" w:hanging="270"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:spacing w:after="0"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="D8D2C8"/></w:pBdr></w:pPr>${run('UNAVET  |  Informe técnico de base de datos', { size: 17, color: '6B5B4D' })}</w:p></w:hdr>`;
const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>${run('Proyecto UNAVET  |  Página ', { size: 17, color: '6B5B4D' })}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  'word/document.xml': documentXml,
  'word/styles.xml': stylesXml,
  'word/numbering.xml': numberingXml,
  'word/header1.xml': headerXml,
  'word/footer1.xml': footerXml,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
  'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Cambios principales de normalización - UNAVET</dc:title><dc:creator>UNAVET</dc:creator><dc:subject>Comparación de la base antes y después de normalizar</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">2026-08-03T00:00:00Z</dcterms:created></cp:coreProperties>`,
  'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>`,
};

for (const [relative, content] of Object.entries(files)) {
  const target = path.join(buildDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

for (const target of [output, zipOutput]) {
  if (fs.existsSync(target)) fs.rmSync(target);
}

const psCommand = `Compress-Archive -Path '${buildDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipOutput.replace(/'/g, "''")}' -Force`;
execFileSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
fs.renameSync(zipOutput, output);
fs.rmSync(buildDir, { recursive: true, force: true });
console.log(`Documento generado: ${output}`);
