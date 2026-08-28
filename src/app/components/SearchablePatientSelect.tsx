import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

type PatientOption = {
  id: string;
  petName?: string;
  tutorName?: string;
  tutorPhone?: string;
};

type SearchablePatientSelectProps = {
  patients: PatientOption[];
  value?: string;
  onChange: (patientId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const patientLabel = (patient: PatientOption) =>
  [patient.petName || 'Sin nombre', patient.tutorName].filter(Boolean).join(' - ');

export default function SearchablePatientSelect({
  patients,
  value = '',
  onChange,
  placeholder = 'Escribe para buscar un paciente',
  emptyLabel = 'Sin vincular',
  disabled = false,
  required = false,
}: SearchablePatientSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedPatient = patients.find((patient) => patient.id === value);
  const [query, setQuery] = useState(selectedPatient ? patientLabel(selectedPatient) : '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedPatient ? patientLabel(selectedPatient) : '');
  }, [value, selectedPatient?.petName, selectedPatient?.tutorName]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const filteredPatients = useMemo(() => {
    const search = normalize(query);
    if (!search || selectedPatient && query === patientLabel(selectedPatient)) return patients;
    return patients.filter((patient) =>
      normalize(`${patient.petName || ''} ${patient.tutorName || ''} ${patient.tutorPhone || ''}`)
        .includes(search)
    );
  }, [patients, query, selectedPatient]);

  const clearSelection = () => {
    setQuery('');
    onChange('');
    setOpen(true);
  };

  const selectPatient = (patient: PatientOption) => {
    setQuery(patientLabel(patient));
    onChange(patient.id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center bg-secondary border border-border rounded-lg focus-within:ring-2 focus-within:ring-primary ${disabled ? 'opacity-75 cursor-not-allowed' : ''}`}>
        <Search className="w-4 h-4 ml-3 text-primary shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) onChange('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && open && filteredPatients.length === 1) {
              event.preventDefault();
              onChange(filteredPatients[0].id);
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="w-full px-3 py-2 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {!disabled && (query || value) && (
          <button type="button" onClick={clearSelection} className="p-2 text-primary hover:text-foreground" aria-label="Quitar paciente">
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          className="mr-1 p-2 text-primary hover:text-foreground disabled:cursor-not-allowed"
          aria-label={open ? 'Cerrar lista de pacientes' : 'Abrir lista de pacientes'}
          aria-expanded={open}
        >
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-[70] mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
          {!required && (
            <button type="button" onClick={() => { clearSelection(); setOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:bg-secondary">
              {emptyLabel}
            </button>
          )}
          {filteredPatients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => selectPatient(patient)}
              className={`w-full px-4 py-2 text-left hover:bg-secondary ${patient.id === value ? 'bg-muted' : ''}`}
            >
              <span className="block text-sm font-medium text-foreground">{patient.petName || 'Sin nombre'}</span>
              <span className="block text-xs text-muted-foreground">
                {[patient.tutorName, patient.tutorPhone].filter(Boolean).join(' · ') || 'Tutor no registrado'}
              </span>
            </button>
          ))}
          {filteredPatients.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No se encontraron pacientes.</p>
          )}
        </div>
      )}
    </div>
  );
}


