import { useCallback, useEffect, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';

const NEXT_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button[role="combobox"]:not([disabled])',
  'button[type="submit"]:not([disabled])',
].join(',');

const isRequiredField = (element: HTMLElement) => {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.required;
  }

  return element.dataset.requiredField === 'true';
};

const isEmpty = (element: HTMLElement) => {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      return !element.checked;
    }

    return element.value.trim() === '';
  }

  if (
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value.trim() === '';
  }

  return (element.dataset.fieldValue ?? '').trim() === '';
};

const belongsToSameForm = (current: HTMLElement, next: HTMLElement) => {
  const currentForm = current.closest('form');
  const nextForm = next.closest('form');

  return currentForm !== null && currentForm === nextForm;
};

const getTargetField = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;

  const directField = target.closest<HTMLElement>(NEXT_FIELD_SELECTOR);
  if (directField) return directField;

  const label = target.closest('label');
  return label?.control instanceof HTMLElement &&
    label.control.matches(NEXT_FIELD_SELECTOR)
    ? label.control
    : null;
};

const getVisibleField = (field: HTMLElement) => {
  if (
    field instanceof HTMLSelectElement &&
    (field.getAttribute('aria-hidden') === 'true' || field.tabIndex === -1)
  ) {
    return (
      field.parentElement?.querySelector<HTMLElement>(
        '[data-required-field="true"]'
      ) ?? field
    );
  }

  return field;
};

export default function RequiredFieldAlert() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const invalidFieldRef = useRef<HTMLElement | null>(null);

  const showRequiredAlert = useCallback((field: HTMLElement) => {
    if (openRef.current) return;

    invalidFieldRef.current = getVisibleField(field);
    openRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    const blockFieldChange = (currentField: HTMLElement, nextField: HTMLElement) => {
      if (
        currentField === nextField ||
        !belongsToSameForm(currentField, nextField) ||
        !isRequiredField(currentField) ||
        !isEmpty(currentField)
      ) {
        return false;
      }

      showRequiredAlert(currentField);
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (openRef.current || !(document.activeElement instanceof HTMLElement)) {
        return;
      }

      const nextField = getTargetField(event.target);
      if (!nextField) return;

      if (blockFieldChange(document.activeElement, nextField)) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Tab' ||
        openRef.current ||
        !(event.target instanceof HTMLElement) ||
        !isRequiredField(event.target) ||
        !isEmpty(event.target)
      ) {
        return;
      }

      event.preventDefault();
      showRequiredAlert(event.target);
    };

    const handleBlur = (event: FocusEvent) => {
      if (openRef.current || !(event.target instanceof HTMLElement)) return;

      const currentField = event.target;
      const nextField = event.relatedTarget;

      if (
        !(nextField instanceof HTMLElement) ||
        !nextField.matches(NEXT_FIELD_SELECTOR) ||
        !belongsToSameForm(currentField, nextField) ||
        !isRequiredField(currentField) ||
        !isEmpty(currentField)
      ) {
        return;
      }

      showRequiredAlert(currentField);
    };

    const handleInvalid = (event: Event) => {
      if (
        !(event.target instanceof HTMLElement) ||
        !isRequiredField(event.target) ||
        !isEmpty(event.target)
      ) {
        return;
      }

      event.preventDefault();
      showRequiredAlert(event.target);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('blur', handleBlur, true);
    document.addEventListener('invalid', handleInvalid, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('invalid', handleInvalid, true);
    };
  }, [showRequiredAlert]);

  const handleOpenChange = (nextOpen: boolean) => {
    openRef.current = nextOpen;
    setOpen(nextOpen);
  };

  const restoreFieldFocus = (event: Event) => {
    event.preventDefault();
    const invalidField = invalidFieldRef.current;

    window.setTimeout(() => {
      if (invalidField?.isConnected) invalidField.focus();
    }, 0);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[2px]" />
        <AlertDialog.Content
          onCloseAutoFocus={restoreFieldFocus}
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl focus:outline-none"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <AlertDialog.Title className="text-lg font-semibold text-foreground">
                Campo obligatorio
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Este campo es obligatorio. Debe completarlo antes de continuar.
              </AlertDialog.Description>
            </div>
          </div>

          <div className="flex justify-end">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
              >
                Entendido
              </button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
