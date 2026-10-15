import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { createPdfPreviewTask, getPdfPreviewRenderSettings } from '../utils/pdfPreview';

export default function PdfDocumentPreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    const load = async () => {
      try {
        loadingTask = await createPdfPreviewTask(url, controller.signal);
        if (disposed) {
          await loadingTask.destroy();
          return;
        }
        const pdf = await loadingTask.promise;
        if (!disposed) {
          setDocument(pdf);
          setIsLoading(false);
        }
      } catch (cause) {
        if (disposed) return;
        console.error('Error al cargar la vista previa PDF:', cause);
        setError('No fue posible mostrar el PDF. Puedes volver a abrir la vista previa o descargar el documento.');
        setIsLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
      controller.abort();
      void loadingTask?.destroy().catch(() => {});
    };
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setWidth(Math.max(0, container.clientWidth - 24));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || width <= 0) return;
    let disposed = false;
    let renderTask: RenderTask | undefined;
    setIsRendering(true);
    setError('');

    const render = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (disposed) return;
        const { viewport, pixelRatio } = getPdfPreviewRenderSettings(page, width, zoom, window.devicePixelRatio);
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No fue posible iniciar el visor PDF');
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!disposed) setIsRendering(false);
      } catch (cause) {
        if (disposed) return;
        console.error('Error al dibujar la vista previa PDF:', cause);
        setError('No fue posible mostrar esta página del PDF. Puedes descargar el documento.');
        setIsRendering(false);
      }
    };

    void render();
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, width, zoom]);

  const busy = isLoading || isRendering;
  const controlClass = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-card p-2 text-foreground transition-colors hover:bg-border disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Página anterior" onClick={() => setPageNumber((page) => page - 1)} disabled={!document || pageNumber <= 1 || busy} className={controlClass}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-foreground" aria-live="polite">
            {document ? `Página ${pageNumber} de ${document.numPages}` : 'Vista previa'}
          </span>
          <button type="button" aria-label="Página siguiente" onClick={() => setPageNumber((page) => page + 1)} disabled={!document || pageNumber >= document.numPages || busy} className={controlClass}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Reducir zoom" onClick={() => setZoom((value) => value - 0.25)} disabled={!document || zoom <= 0.75 || busy} className={controlClass}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} disabled={!document || busy} className={`${controlClass} px-3`}>
            Ajustar
          </button>
          <button type="button" aria-label="Ampliar zoom" onClick={() => setZoom((value) => value + 0.25)} disabled={!document || zoom >= 3 || busy} className={controlClass}>
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-scroll rounded-lg border border-border bg-muted" aria-busy={busy && !error}>
        {error ? (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-primary" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : busy ? (
          <div role="status" className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            Cargando documento…
          </div>
        ) : null}
        <div className={busy || error ? 'hidden' : 'w-max min-w-full p-3'}>
          <canvas ref={canvasRef} role="img" aria-label={`Página ${pageNumber} del documento PDF`} className="mx-auto block bg-white shadow-md" />
        </div>
      </div>
    </div>
  );
}
