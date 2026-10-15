import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist';

export const getPdfPreviewRenderSettings = (
  page: PDFPageProxy,
  width: number,
  zoom: number,
  devicePixelRatio: number
) => {
  const originalViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width / originalViewport.width) * zoom });
  // Limita la memoria de la imagen en móviles y pantallas de alta densidad.
  const pixelRatio = Math.min(
    devicePixelRatio || 1,
    2,
    Math.sqrt(8_000_000 / (viewport.width * viewport.height))
  );
  return { viewport, pixelRatio };
};

// Vite publica el worker y las fuentes con la aplicación, sin depender de un CDN.
const resources = import.meta.glob(
  [
    '../../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}',
    '../../../node_modules/pdfjs-dist/cmaps/*.bcmap',
  ],
  { eager: true, query: '?url', import: 'default' }
) as Record<string, string>;

const resourceUrls = new Map(
  Object.entries(resources).map(([path, url]) => [path.split('/').pop(), url])
);

class PreviewBinaryDataFactory {
  async fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    const url = resourceUrls.get(filename);
    if (!url) throw new Error('No fue posible cargar los recursos del PDF');
    const response = await fetch(url);
    if (!response.ok) throw new Error('No fue posible cargar los recursos del PDF');
    return new Uint8Array(await response.arrayBuffer());
  }
}

export const createPdfPreviewTask = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('No fue posible cargar el documento PDF');
  const data = new Uint8Array(await response.arrayBuffer());
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useWasm: false,
    useWorkerFetch: false,
    BinaryDataFactory: PreviewBinaryDataFactory,
  });
};
