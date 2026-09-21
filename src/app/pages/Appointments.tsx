import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import type { Appointment } from '../utils/types';
import SearchablePatientSelect from '../components/SearchablePatientSelect';
import ThemedSelect from '../components/ThemedSelect';
import {
  getTodayLocal,
  isValidName,
  isValidPhone,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';
import { formatDateForDisplay } from '../utils/dateFormat';
import { useModulePermissions } from '../hooks/useModulePermissions';
import { API_URL } from '../config/api';

type AppointmentFormData = Partial<Appointment> & {
  animalSize?: string;
  breed?: string;
  patientId?: string;
};

type DeleteTarget = {
  id: string;
  petName: string;
  date: string;
  time: string;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('unavet_token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

type CatalogItem = {
  nombre: string;
  [key: string]: any;
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCalendarDays = (month: Date) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysBeforeMonth = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysAfterMonth =
    (7 - ((daysBeforeMonth + daysInMonth) % 7)) % 7;
  const visibleDaysAfterMonth = Math.min(daysAfterMonth, 3);
  const visibleDayCount =
    daysBeforeMonth + daysInMonth + visibleDaysAfterMonth;

  return Array.from({ length: visibleDayCount }, (_, index) =>
    new Date(year, monthIndex, 1 - daysBeforeMonth + index)
  );
};

const getAppointmentColor = (status?: string) => {
  if (status === 'Confirmada') return 'border-green-300 bg-green-50 text-green-900';
  if (status === 'Completada') return 'border-blue-300 bg-blue-50 text-blue-900';
  if (status === 'Cancelada') return 'border-gray-300 bg-gray-100 text-gray-700';
  return 'border-amber-300 bg-amber-50 text-amber-900';
};

export default function Appointments() {
  const location = useLocation();
  const { permissions } = useModulePermissions('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);

  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);

  const [formData, setFormData] = useState<AppointmentFormData>({});
  const [patients, setPatients] = useState<any[]>([]);
 
  const [appointmentStatusOptions, setAppointmentStatusOptions] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);


  useEffect(() => {
    loadAppointments();
    loadPatients();
    loadCatalogs();
  }, []);

  useEffect(() => {
    const targetId = location.state && typeof location.state === 'object'
      ? (location.state as { highlightAppointmentId?: string }).highlightAppointmentId
      : undefined;

    if (!targetId || appointments.length === 0) return;

    const match = appointments.find(
      (appointment) => String(appointment.id) === String(targetId)
    );

    if (match) {
      setSelectedAppointment(match);
      setFilterDate(match.date);
      setCalendarMonth(
        new Date(match.date ? new Date(`${match.date}T00:00:00`).getFullYear() : new Date().getFullYear(), match.date ? new Date(`${match.date}T00:00:00`).getMonth() : new Date().getMonth(), 1)
      );
    }
  }, [appointments, location.state]);

  const loadAppointments = async () => {
    try {
      const response = await fetch(`${API_URL}/citas`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar citas');
      }

      setAppointments(data);
    } catch (error) {
      console.error('Error al cargar citas:', error);
      setAppointments([]);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await fetch(`${API_URL}/pacientes`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar pacientes');
      }

      setPatients(data);
    } catch (error) {
      console.error('Error al cargar pacientes:', error);
      setPatients([]);
    }
  };


  const mapCatalogNames = (items: CatalogItem[]) =>
    items.map((item) => item.nombre);

  const fetchCatalogSafely = async (
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    try {
      const response = await fetch(`${API_URL}/catalogos/${endpoint}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error al cargar catálogo ${endpoint}`);
      }

      setter(mapCatalogNames(data));
    } catch (error) {
      console.error(`Error al cargar catálogo ${endpoint}:`, error);
      setter([]);
    }
  };

  const loadCatalogs = async () => {
    await fetchCatalogSafely('estados-cita', setAppointmentStatusOptions);
  };

  const filteredAppointments = appointments.filter((a: any) => {
    const petName = a.petName || '';
    const tutorName = a.tutorName || '';
    const breed = a.breed || '';

    const matchesSearch =
      petName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tutorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      breed.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = !filterStatus || a.status === filterStatus;
    const matchesDate = !filterDate || a.date === filterDate;

    return matchesSearch && matchesStatus && matchesDate;
  });

  const calendarDays = getCalendarDays(calendarMonth);
  const appointmentsByDate = filteredAppointments.reduce<Record<string, Appointment[]>>(
    (grouped, appointment) => {
      if (!grouped[appointment.date]) grouped[appointment.date] = [];
      grouped[appointment.date].push(appointment);
      grouped[appointment.date].sort((a, b) => a.time.localeCompare(b.time));
      return grouped;
    },
    {}
  );

  const calendarMonthLabel = calendarMonth.toLocaleDateString('es-GT', {
    month: 'long',
    year: 'numeric',
  });
  const monthAppointments = filteredAppointments
    .filter((appointment) => {
      const appointmentDate = new Date(`${appointment.date}T00:00:00`);
      return (
        appointmentDate.getFullYear() === calendarMonth.getFullYear() &&
        appointmentDate.getMonth() === calendarMonth.getMonth()
      );
    })
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`)
    );

  useEffect(() => {
    if (!filterDate) return;
    const selectedDate = new Date(`${filterDate}T00:00:00`);
    setCalendarMonth(
      new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    );
  }, [filterDate]);

  useEffect(() => {
    const loadTimeSlots = async () => {
      if (!formData.date) {
        setTimeSlots([]);
        return;
      }
      try {
        const response = await fetch(
          `${API_URL}/catalogos/horarios?modulo=appointments&fecha=${encodeURIComponent(
            formData.date
          )}`,
          { headers: getAuthHeaders() }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setTimeSlots(Array.isArray(data.slots) ? data.slots : []);
      } catch (error) {
        console.error('Error al cargar horarios de citas:', error);
        setTimeSlots([]);
      }
    };
    void loadTimeSlots();
  }, [formData.date]);

  const isTimeUnavailable = (time: string) => {
    return appointments.some(
      (a: any) =>
        a.date === formData.date &&
        a.time === time &&
        a.status !== 'Cancelada' &&
        a.id !== editingAppointment?.id
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (
      !isValidName(formData.petName) ||
      !isValidName(formData.tutorFirstName) ||
      !isValidName(formData.tutorFirstSurname) ||
      (formData.tutorMiddleName && !isValidName(formData.tutorMiddleName)) ||
      (formData.tutorSecondSurname && !isValidName(formData.tutorSecondSurname))
    ) {
      setFormError({
        title: 'Revisa los nombres',
        message: 'Solo pueden contener letras y deben tener al menos 2 caracteres.',
      });
      return;
    }

    if (!formData.time) {
      setFormError({
        title: 'Falta la hora',
        message: 'Debes seleccionar una hora antes de guardar la cita.',
      });
      return;
    }

    if (!isValidPhone(formData.tutorPhone)) {
      setFormError({
        title: 'Teléfono inválido',
        message: 'El teléfono debe contener únicamente entre 8 y 15 dígitos.',
      });
      return;
    }

    if (!formData.date || formData.date < getTodayLocal()) {
      setFormError({
        title: 'Fecha inválida',
        message: 'La fecha de la cita no puede estar en el pasado.',
      });
      return;
    }

    try {
      const url = editingAppointment
        ? `${API_URL}/citas/${editingAppointment.id}`
        : `${API_URL}/citas`;

      const method = editingAppointment ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.status === 409) {
        setShowConflictModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Error al guardar cita');
      }

      await loadAppointments();

      setSuccessMessage(
        formData.patientId
          ? editingAppointment
            ? 'Cita actualizada correctamente y sincronizada con el historial clínico'
            : 'Cita creada correctamente y agregada al historial clínico del paciente'
          : editingAppointment
          ? 'Cita actualizada correctamente'
          : 'Cita creada correctamente'
      );

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar cita:', error);
      setFormError({
        title: 'No se pudo guardar la cita',
        message:
          error instanceof Error
            ? error.message
            : 'Revisa el backend o la consola para más detalles.',
      });
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowModal(false);
    setEditingAppointment(null);
    setFormData({});
  };

  const openDeleteModal = (appointment: Appointment) => {
    setDeleteTarget({
      id: appointment.id,
      petName: (appointment as any).petName || 'la mascota',
      date: appointment.date,
      time: appointment.time,
    });

    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(`${API_URL}/citas/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al eliminar cita');
      }

      await loadAppointments();

      setShowDeleteModal(false);
      setDeleteTarget(null);
      setShowDeleteSuccessModal(true);
    } catch (error) {
      console.error('Error al eliminar cita:', error);
      alert('No se pudo eliminar la cita.');
    }
  };

  const closeDeleteSuccessModal = () => {
    setShowDeleteSuccessModal(false);
  };

  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_URL}/citas/${id}/estado`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cambiar estado');
      }

      await loadAppointments();
      setSelectedAppointment((current) =>
        current?.id === id
          ? { ...current, status: newStatus as Appointment['status'] }
          : current
      );
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('No se pudo cambiar el estado de la cita.');
    }
  };

  const openModal = (appointment?: Appointment, initialDate?: string) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData(appointment);
    } else {
      setEditingAppointment(null);
      setFormData({
        date: initialDate || getTodayLocal(),
      });
    }

    setShowModal(true);
  };

  const closeFormModal = () => {
    setFormError(null);
    setShowModal(false);
    setEditingAppointment(null);
    setFormData({});
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
    setFilterDate('');
  };

  const goToCurrentMonth = () => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setFilterDate('');
  };

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-foreground text-xl md:text-2xl font-bold mb-2">
            Citas clínicas
          </h1>
        </div>

        {permissions.canCreate && <button
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-lg bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva cita
        </button>}
      </div>
      <div className="mb-4 rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)] md:p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-foreground mb-2 text-sm">
              Buscar
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por mascota, tutor o raza"
                className="w-full rounded-xl border border-border bg-secondary/80 py-2.5 pl-10 pr-4 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Estado
            </label>

            <ThemedSelect
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos</option>

              {appointmentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </ThemedSelect>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Fecha
            </label>

            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 border-b border-border bg-gradient-to-r from-muted/60 via-card to-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between md:p-3.5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-white shadow-lg shadow-primary/20">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black capitalize tracking-tight text-foreground md:text-xl">
              {calendarMonthLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeCalendarMonth(-1)}
              className="rounded-xl bg-muted p-2.5 text-foreground transition-colors hover:bg-border"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goToCurrentMonth}
              className="rounded-xl bg-muted px-4 py-2 font-semibold text-foreground transition-colors hover:bg-border"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => changeCalendarMonth(1)}
              className="rounded-xl bg-muted p-2.5 text-foreground transition-colors hover:bg-border"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3 lg:hidden">
          {monthAppointments.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              onClick={() => setSelectedAppointment(appointment)}
              className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    {formatDateForDisplay(appointment.date)} · {appointment.time.slice(0, 5)}
                  </p>
                  <h3 className="mt-1 truncate text-base font-bold text-foreground">
                    {appointment.petName}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">
                    Tutor: {appointment.tutorName}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getAppointmentColor(
                    appointment.status
                  )}`}
                >
                  {appointment.status}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-foreground">
                {appointment.reason || 'Sin motivo especificado'}
              </p>
            </button>
          ))}

          {monthAppointments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No hay citas en este mes con los filtros seleccionados.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <div className="min-w-[840px]">
            <div className="grid grid-cols-7 bg-primary text-[#F7EFE6]">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
                <div key={day} className="px-3 py-2 text-center text-sm font-bold">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const dateKey = toLocalDateKey(day);
                const dayAppointments = appointmentsByDate[dateKey] || [];
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isToday = dateKey === getTodayLocal();
                const canCreate = permissions.canCreate && dateKey >= getTodayLocal();

                return (
                  <div
                    key={dateKey}
                    className={`min-h-36 border-r border-b border-border/80 p-2.5 transition-colors ${
                      isCurrentMonth ? 'bg-card' : 'bg-muted/50'
                    } ${isToday ? 'bg-primary/5 ring-2 ring-inset ring-primary/20' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
                          isToday
                            ? 'bg-primary text-white'
                            : isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {canCreate && (
                        <button
                          type="button"
                          onClick={() => openModal(undefined, dateKey)}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-primary hover:bg-muted transition-colors"
                          aria-label={`Crear cita el ${dateKey}`}
                          title="Nueva cita en este día"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-0.5">
                      {dayAppointments.map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => setSelectedAppointment(appointment)}
                          className={`w-full text-left rounded-lg border px-2 py-1.5 transition-all hover:shadow-sm ${getAppointmentColor(
                            appointment.status
                          )}`}
                        >
                          <span className="block text-sm font-extrabold leading-tight">
                            {appointment.time.slice(0, 5)} · {appointment.petName}
                          </span>
                          <span className="block truncate text-[11px] font-semibold opacity-100">
                            {appointment.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {filteredAppointments.length === 0 && (
          <div className="p-4 text-center text-muted-foreground font-medium border-t border-border">
            No hay citas que coincidan con los filtros seleccionados.
          </div>
        )}
      </section>

      {selectedAppointment && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-50">
          <div className="relative w-full max-w-md rounded-[28px] border border-border/80 bg-card p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
            <button
              type="button"
              onClick={() => setSelectedAppointment(null)}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              aria-label="Cerrar detalle"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-primary/80">
              {formatDateForDisplay(selectedAppointment.date)} · {selectedAppointment.time.slice(0, 5)}
            </p>
            <h3 className="mb-5 pr-10 text-2xl font-black tracking-tight text-foreground">
              {selectedAppointment.petName}
            </h3>

            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-muted-foreground font-semibold">Tutor</p>
                <p className="text-foreground">{selectedAppointment.tutorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-semibold">Teléfono</p>
                <p className="text-foreground">{selectedAppointment.tutorPhone}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-semibold">Raza</p>
                <p className="text-foreground">
                  {(selectedAppointment as AppointmentFormData).breed || 'No especificada'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-semibold">Tamaño</p>
                <p className="text-foreground">
                  {(selectedAppointment as AppointmentFormData).animalSize || 'No especificado'}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-muted-foreground text-sm font-semibold">Motivo</p>
              <p className="text-foreground text-sm leading-6">
                {selectedAppointment.reason}
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cita agendada por
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {selectedAppointment.createdByName ||
                  'No disponible para este registro anterior'}
              </p>
            </div>

            <div className="mb-5">
              <label className="block text-foreground text-sm font-bold mb-2">
                Estado de la cita
              </label>
              <ThemedSelect
                value={selectedAppointment.status}
                disabled={!permissions.canEdit}
                onChange={(event) =>
                  void changeStatus(selectedAppointment.id, event.target.value)
                }
                className={`w-full px-3 py-2 rounded-lg border font-semibold ${getAppointmentColor(
                  selectedAppointment.status
                )}`}
              >
                {appointmentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </ThemedSelect>
            </div>

            <div className="flex gap-3">
              {permissions.canEdit && <button
                type="button"
                onClick={() => {
                  const appointment = selectedAppointment;
                  setSelectedAppointment(null);
                  openModal(appointment);
                }}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 font-semibold text-[#F7EFE6] shadow-lg shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
              >
                <span className="flex items-center justify-center gap-2">
                  <Edit className="w-4 h-4" />
                  Editar
                </span>
              </button>}
              {permissions.canDelete && <button
                type="button"
                onClick={() => {
                  const appointment = selectedAppointment;
                  setSelectedAppointment(null);
                  openDeleteModal(appointment);
                }}
                className="flex-1 rounded-xl bg-red-100 px-4 py-2.5 font-semibold text-red-700 transition-colors hover:bg-red-200"
              >
                <span className="flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </span>
              </button>}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-50">
          <div className="patient-form-shell max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-border/80 bg-card p-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)] md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background/60 p-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                  Agenda
                </p>
                <h2 className="text-foreground text-xl font-black tracking-tight md:text-2xl">
                  {editingAppointment ? 'Editar cita' : 'Nueva cita'}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Completa los datos de la cita clínica.
                </p>
              </div>

              <button
                type="button"
                onClick={closeFormModal}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="patient-form space-y-5">
              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Vincular a paciente existente, opcional
                </label>

                <SearchablePatientSelect
                  patients={patients}
                  value={formData.patientId || ''}
                  onChange={(patientId) => {
                    const selectedPatient = patients.find(
                      (p) => p.id === patientId
                    );

                    if (selectedPatient) {
                      setFormData({
                        ...formData,
                        patientId: selectedPatient.id,
                        petName: selectedPatient.petName || '',
                        tutorFirstName: selectedPatient.tutorFirstName || '',
                        tutorMiddleName: selectedPatient.tutorMiddleName || '',
                        tutorFirstSurname: selectedPatient.tutorFirstSurname || '',
                        tutorSecondSurname: selectedPatient.tutorSecondSurname || '',
                        tutorPhone: selectedPatient.tutorPhone || '',
                        breed: selectedPatient.breed || '',
                      });
                    } else {
                      setFormData({ ...formData, patientId: '' });
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {([
                  ['Primer nombre del tutor', 'tutorFirstName', true],
                  ['Segundo nombre del tutor', 'tutorMiddleName', false],
                  ['Primer apellido del tutor', 'tutorFirstSurname', true],
                  ['Segundo apellido del tutor', 'tutorSecondSurname', false],
                ] as const).map(([label, field, required]) => (
                  <FormInput
                    key={field}
                    label={`${label}${required ? '' : ' (opcional)'}`}
                    value={formData[field] || ''}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        [field]: sanitizeName(value),
                      })
                    }
                    required={required}
                    minLength={required ? 2 : undefined}
                    maxLength={80}
                  />
                ))}

                <FormInput
                  label="Teléfono del tutor"
                  value={formData.tutorPhone || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, tutorPhone: sanitizePhone(value) })
                  }
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{8,12}"
                  minLength={8}
                  maxLength={12}
                  title="Entre 8 y 12 dígitos"
                />

                <FormInput
                  label="Nombre de la mascota"
                  value={formData.petName || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, petName: sanitizeName(value) })
                  }
                  required
                  minLength={2}
                  maxLength={80}
                />

                <FormInput
                  label="Fecha"
                  type="date"
                  value={formData.date || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      date: value,
                      time: '',
                    })
                  }
                  required
                  min={getTodayLocal()}
                />

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Hora
                  </label>

                  <ThemedSelect
                    value={formData.time || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, time: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                    disabled={!formData.date}
                  >
                    <option value="">
                      {formData.date
                        ? 'Seleccionar hora'
                        : 'Seleccione una fecha primero'}
                    </option>

                    {timeSlots.map((time) => {
                      const unavailable = isTimeUnavailable(time);

                      return (
                        <option key={time} value={time} disabled={unavailable}>
                          {unavailable ? `${time} - No disponible` : time}
                        </option>
                      );
                    })}
                  </ThemedSelect>
                </div>
              </div>

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Motivo de consulta
                </label>

                <textarea
                  value={formData.reason || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-3 text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  rows={3}
                  required
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-[#F7EFE6] shadow-lg shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 sm:w-auto"
                >
                  {editingAppointment ? 'Actualizar' : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={closeFormModal}
                  className="w-full rounded-xl bg-muted px-4 py-2.5 font-semibold text-foreground transition-colors hover:bg-border sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-[60]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue guardada exitosamente en el módulo de citas.
            </p>

            <button
              onClick={closeSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={closeDeleteModal}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
            </div>

            <h3 className="text-foreground text-xl text-center mb-2">
              ¿Estás seguro de eliminar esta cita?
            </h3>

            <p className="text-muted-foreground text-sm text-center mb-6">
              Se eliminará la cita de{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.petName}
              </span>{' '}
              programada para el{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.date}
              </span>{' '}
              a las{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.time}
              </span>
              . Esta acción también eliminará el registro automático del
              historial clínico, si estaba vinculado.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Sí, eliminar
              </button>

              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-[80]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Cita eliminada correctamente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La cita fue eliminada exitosamente del módulo de citas clínicas.
            </p>

            <button
              onClick={closeDeleteSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}

      {showConflictModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-[90]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="w-10 h-10 text-yellow-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Horario no disponible
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              Ya existe una cita registrada para la fecha y hora seleccionadas.
              Elige otro horario disponible.
            </p>

            <button
              onClick={() => setShowConflictModal(false)}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}

      {formError && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center bg-slate-900/5 p-4 backdrop-blur-[0.5px] z-[95]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">{formError.title}</h3>

            <p className="text-muted-foreground text-sm mb-6">{formError.message}</p>

            <button
              type="button"
              onClick={() => setFormError(null)}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </ModalCard>
        </div>
      )}
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  minLength,
  maxLength,
  pattern,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        required={required}
        min={min}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
      />
    </div>
  );
}

function ModalCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
      {children}
    </div>
  );
}
