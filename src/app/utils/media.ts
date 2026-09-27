import { API_URL } from '../config/api';

export const resolveMediaUrl = (value?: string | null): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^(?:data:|blob:|https?:\/\/)/i.test(normalized)) return normalized;
  return `${API_URL}/${normalized.replace(/^\/+/, '')}`;
};

export const loadMediaAsDataUrl = async (
  value?: string | null
): Promise<string> => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('data:')) return normalized;

  const response = await fetch(resolveMediaUrl(normalized));
  if (!response.ok) {
    throw new Error('No fue posible cargar la imagen');
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer la imagen'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};
