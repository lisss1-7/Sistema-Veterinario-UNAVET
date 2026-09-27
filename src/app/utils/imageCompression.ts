const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer la imagen'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('La imagen seleccionada no es válida'));
    image.onload = () => resolve(image);
    image.src = source;
  });

export const compressImageFile = async (
  file: File,
  maxDimension = 1600
): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Debe seleccionar una imagen válida');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('La imagen original excede el límite de 15 MB');
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('No fue posible procesar la imagen');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.68, 0.54]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= 5 * 1024 * 1024) return result;
  }

  throw new Error('La imagen sigue siendo demasiado grande después de optimizarla');
};
