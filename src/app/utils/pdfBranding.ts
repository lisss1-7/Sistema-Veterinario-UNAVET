import type { jsPDF } from 'jspdf';
import unavetLogo from '../assets/unavet-logo.png';

let logoBase64Promise: Promise<string> | null = null;

export const getUnavetLogoBase64 = (): Promise<string> => {
  if (!logoBase64Promise) {
    logoBase64Promise = fetch(unavetLogo)
      .then((response) => {
        if (!response.ok) throw new Error('No fue posible cargar el logo de UNAVET');
        return response.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      );
  }

  return logoBase64Promise;
};

export const drawUnavetPdfHeader = (
  doc: jsPDF,
  logoBase64: string,
  subtitle: string
) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor('#3F3A34');
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.addImage(logoBase64, 'PNG', 15, 4, 24, 24);

  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('UNAVET', 46, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, 46, 23);
};
