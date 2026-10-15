import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Plus } from 'lucide-react';

export function CreateButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="button"
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-base font-semibold text-[#F7EFE6] shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {children}
    </button>
  );
}

export default function ModuleHeader({ title, description, children }: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:min-h-[3.5rem] sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:pt-1">
        <h1 className="mb-1 break-words text-xl font-bold text-foreground md:text-2xl">{title}</h1>
        {description && <p className="hidden text-sm text-muted-foreground sm:block">{description}</p>}
      </div>
      {children && (
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:flex-wrap-reverse sm:items-start sm:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}
