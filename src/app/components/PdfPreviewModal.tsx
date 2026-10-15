import { Download, ExternalLink, FileText, X } from 'lucide-react';
import PdfDocumentPreview from './PdfDocumentPreview';

type PdfPreviewModalProps = {
  url: string;
  title: string;
  description?: string;
  onClose: () => void;
  onDownload?: () => void;
};

export default function PdfPreviewModal({
  url,
  title,
  description = 'Revise el documento antes de descargarlo.',
  onClose,
  onDownload,
}: PdfPreviewModalProps) {
  return (
    <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
      <div className="pdf-preview-dialog flex h-[100dvh] min-w-0 w-full flex-col overflow-hidden bg-card shadow-2xl sm:h-[92dvh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-border">
        <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base font-medium text-foreground sm:text-lg">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">{title}</span>
            </h3>
            <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors hover:bg-border"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir PDF
            </a>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-[#F7EFE6] transition-colors hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                Descargar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-muted p-2 text-foreground transition-colors hover:bg-border"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 bg-muted p-2 sm:p-3">
          <PdfDocumentPreview key={url} url={url} />
        </div>
      </div>
    </div>
  );
}
