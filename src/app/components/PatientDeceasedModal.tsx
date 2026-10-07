import { useState } from 'react';
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
    <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="patient-deceased-title">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <h3 id="patient-deceased-title" className="mb-2 text-xl text-foreground">Cambiar a fallecido</h3>
        <p className="mb-6 text-sm text-muted-foreground">
          ¿Deseas marcar a {patient.petName} como fallecido? Su expediente e historial se conservarán.
        </p>
        {errorMessage && <p role="alert" className="mb-4 text-sm text-destructive">{errorMessage}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onClose} disabled={isSubmitting}
            className="flex-1 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void confirm()} disabled={isSubmitting}
            className="flex-1 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
