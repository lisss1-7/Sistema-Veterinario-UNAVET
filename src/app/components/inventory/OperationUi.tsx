import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export const inputClass = 'w-full min-w-0 rounded-xl border border-border bg-secondary px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
export const secondaryButton = 'rounded-xl border border-border bg-muted px-4 py-2.5 text-foreground hover:bg-border disabled:opacity-50';
export const primaryButton = 'rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50';

export function OperationModal({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  return <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
    <div role="dialog" aria-modal="true" aria-label={title} className="patient-form-shell max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-border bg-card p-4 shadow-2xl md:p-6">
      <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/60 p-4">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className={secondaryButton}><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-sm text-foreground"><span className="mb-2 block">{label}</span>{children}</label>;
}

export function OperationNotice({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-800'}`}>{message}</p>;
}
