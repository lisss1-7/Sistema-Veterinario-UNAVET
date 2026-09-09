const fs = require('node:fs');
const path = require('node:path');
const { jsPDF } = require('jspdf');

const root = path.resolve(__dirname, '..', '..');
const logoPath = path.join(root, 'src', 'app', 'assets', 'unavet-logo.png');
const outputPath = path.join(__dirname, 'prescription-verification.pdf');
const logo = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

const doc = new jsPDF();
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();

doc.setFillColor('#FFFFFF');
doc.rect(0, 0, pageWidth, pageHeight, 'F');
doc.setFillColor('#3F3A34');
doc.rect(0, 0, pageWidth, 36, 'F');
doc.addImage(logo, 'PNG', 15, 6, 24, 24);
doc.setTextColor('#FFFFFF');
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text('UNAVET', 46, 15);
doc.setTextColor('#2F2924');
doc.setFontSize(16);
doc.text('Receta Medica Veterinaria', 15, 47);
doc.setFont('helvetica', 'normal');
doc.setFontSize(10.5);
doc.text('Mascota: Prueba', 15, 58);
doc.text('Tutor: Persona de prueba', 15, 65);
doc.text('Fecha: 2026-09-05', 15, 72);
doc.text('Medicamento: Producto de prueba', 15, 92);
doc.text('Cantidad: 1', 15, 101);
doc.text('Indicaciones: Cada 12 horas durante 5 dias.', 15, 110);

const bytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, bytes);
console.log(JSON.stringify({
  outputPath,
  byteLength: bytes.length,
  header: bytes.subarray(0, 8).toString('latin1'),
  trailer: bytes.subarray(-12).toString('latin1'),
}));
