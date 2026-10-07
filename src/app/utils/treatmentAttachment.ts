import { compressImageFile } from './imageCompression';
import { loadMediaAsDataUrl } from './media';

export const isPdfAttachment = (value?: string | null): boolean => {
  const normalized = String(value || '').trim();
  return /^data:application\/pdf[;,]/i.test(normalized) ||
    /\.pdf$/i.test(normalized.split(/[?#]/)[0]);
};

export const readTreatmentAttachment = async (file: File): Promise<string> => {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return compressImageFile(file);
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('El archivo PDF excede el límite de 5 MB');
  }
  const header = new TextDecoder().decode(await file.slice(0, 8).arrayBuffer());
  if (!/^%PDF-[12]\.\d/.test(header)) {
    throw new Error('El archivo seleccionado no es un PDF válido');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer el archivo PDF'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file.slice(0, file.size, 'application/pdf'));
  });
};

export const loadPdfAttachment = async (value: string): Promise<Blob> => {
  const dataUrl = await loadMediaAsDataUrl(value);
  if (!/^data:application\/pdf;base64,/i.test(dataUrl)) {
    throw new Error('No fue posible cargar el archivo PDF');
  }
  const content = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(content, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
};
