import { useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';
import type { Patient } from '../utils/types';
import { requestJson } from '../utils/apiClient';

type DeceasedStatus = { isDeceased: boolean; deceasedAt: string };

type PatientDeceasedModalProps = {
  patient: Pick<Patient, 'id' | 'petName'>;
  onClose: () => void;
  onConfirmed: (status: DeceasedStatus) => void;
};

export default function PatientDeceasedModal({ patient, onClose, onConfirmed }: PatientDeceasedModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const status = await requestJson<DeceasedStatus>(`pacientes/${patient.id}/fallecido`, {
        method: 'PATCH',
        defaultError: 'No fue posible registrar el fallecimiento',
      });
      onConfirmed(status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No fue posible registrar el fallecimiento');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-backdrop fixed inset-0 z-[90]" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 text-center shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelButtonRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => { if (isSubmitting) event.preventDefault(); }}
        >
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <AlertDialog.Title className="mb-2 text-xl text-foreground">¿Cambiar a fallecido?</AlertDialog.Title>
        <AlertDialog.Description className="mb-6 break-words text-sm text-muted-foreground">
          ¿Deseas marcar a {patient.petName} como fallecido? Su expediente e historial se conservarán.
        </AlertDialog.Description>
        {errorMessage && <p role="alert" className="mb-4 text-sm text-destructive">{errorMessage}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <AlertDialog.Cancel asChild>
            <button ref={cancelButtonRef} type="button" disabled={isSubmitting}
              className="min-h-11 flex-1 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border disabled:opacity-50">
              Cancelar
            </button>
          </AlertDialog.Cancel>
          <button type="button" onClick={() => void confirm()} disabled={isSubmitting}
            className="min-h-11 flex-1 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : 'Sí, cambiar a fallecido'}
          </button>
        </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
