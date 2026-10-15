import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react';

type Props = {
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

export default function CameraCaptureModal({ onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('La cámara no está disponible en este navegador. Puedes usar la opción Subir imagen o PDF.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
      } catch (cause) {
        if (disposed) return;
        stream?.getTracks().forEach((track) => track.stop());
        const name = cause instanceof Error ? cause.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara en tu navegador para tomar una foto. También puedes subir una imagen del dispositivo.'
            : name === 'NotFoundError'
              ? 'No se encontró una cámara en este dispositivo. Puedes subir una imagen del dispositivo.'
              : cause instanceof Error && !navigator.mediaDevices?.getUserMedia
                ? cause.message
                : 'No fue posible iniciar la cámara. Comprueba que no esté en uso por otra aplicación o sube una imagen del dispositivo.'
        );
      }
    };

    void start();
    return () => {
      disposed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || capturing || !video.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    try {
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No fue posible capturar la fotografía.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No fue posible capturar la fotografía.')), 'image/jpeg', 0.85);
      });
      await onCapture(new File([blob], 'foto-tratamiento.jpg', { type: 'image/jpeg' }));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible capturar la fotografía.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !capturing) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-[110]" />
        <Dialog.Content onEscapeKeyDown={(event) => { if (capturing) event.preventDefault(); }} onPointerDownOutside={(event) => { if (capturing) event.preventDefault(); }} className="patient-form-shell fixed left-1/2 top-1/2 z-[111] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl focus:outline-none sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold text-foreground">Tomar foto</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Fotografía del tratamiento o servicio.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" disabled={capturing} aria-label="Cerrar cámara" className="patient-form-close flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
            <video ref={videoRef} autoPlay muted playsInline onLoadedData={() => setReady(true)} className="aspect-video w-full object-contain" />
            {!ready && !error && (
              <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Iniciando cámara…
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void capture()} disabled={!ready || Boolean(error) || capturing} className="patient-form-primary flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              {capturing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              Capturar foto
            </button>
            <Dialog.Close asChild>
              <button type="button" disabled={capturing} className="patient-form-secondary min-h-[44px] flex-1 rounded-xl border px-4 py-2.5 font-semibold disabled:opacity-50">Cancelar</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
