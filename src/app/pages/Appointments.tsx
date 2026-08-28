import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
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
import {
  getTodayLocal,
  isValidName,
  isValidPhone,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';

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

const API_URL = '/api';

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

  return Array.from({ length: 42 }, (_, index) =>
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
      toast.error('Revisa los nombres', {
        description:
          'Solo pueden contener letras y deben tener al menos 2 caracteres.',
      });
      return;
    }

    if (!isValidPhone(formData.tutorPhone)) {
      alert('El teléfono debe contener únicamente entre 8 y 15 dígitos.');
      return;
    }

    if (!formData.date || formData.date < getTodayLocal()) {
      alert('La fecha de la cita no puede estar en el pasado.');
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
      alert('No se pudo guardar la cita. Revisa el backend o la consola.');
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
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            Citas Clínicas
          </h1>
        </div>

        <button
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva cita
        </button>
      </div>

      <div className="bg-card rounded-xl p-4 md:p-6 shadow-lg mb-6 border border-border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Estado
            </label>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="">Todos</option>

              {appointmentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Fecha
            </label>

            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>
        </div>
      </div>

      <section className="bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-white rounded-lg">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-foreground capitalize">
              {calendarMonthLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeCalendarMonth(-1)}
              className="p-2 rounded-lg bg-muted hover:bg-border text-foreground transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goToCurrentMonth}
              className="px-4 py-2 rounded-lg bg-muted hover:bg-border text-foreground font-semibold transition-colors"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => changeCalendarMonth(1)}
              className="p-2 rounded-lg bg-muted hover:bg-border text-foreground transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
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
                const canCreate = dateKey >= getTodayLocal();

                return (
                  <div
                    key={dateKey}
                    className={`min-h-36 border-r border-b border-border p-2 ${
                      isCurrentMonth ? 'bg-card' : 'bg-muted/70'
                    } ${isToday ? 'ring-2 ring-inset ring-accent' : ''}`}
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
                          <span className="block text-xs font-bold">
                            {appointment.time.slice(0, 5)} · {appointment.petName}
                          </span>
                          <span className="block text-[11px] truncate opacity-80">
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
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => setSelectedAppointment(null)}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              aria-label="Cerrar detalle"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-sm font-semibold text-primary mb-1">
              {selectedAppointment.date} · {selectedAppointment.time.slice(0, 5)}
            </p>
            <h3 className="text-2xl font-bold text-foreground mb-5 pr-10">
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

            <div className="mb-5">
              <label className="block text-foreground text-sm font-bold mb-2">
                Estado de la cita
              </label>
              <select
                value={selectedAppointment.status}
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
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const appointment = selectedAppointment;
                  setSelectedAppointment(null);
                  openModal(appointment);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg font-semibold transition-colors"
              >
                <Edit className="w-4 h-4" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  const appointment = selectedAppointment;
                  setSelectedAppointment(null);
                  openDeleteModal(appointment);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  {editingAppointment ? 'Editar cita' : 'Nueva cita'}
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
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

            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  pattern="[0-9]{8,15}"
                  minLength={8}
                  maxLength={15}
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

                  <select
                    value={formData.time || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, time: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
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
                  </select>
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
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  rows={3}
                  required
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingAppointment ? 'Actualizar' : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={closeFormModal}
                  className="w-full sm:w-auto px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[60]">
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
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[70]">
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
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[80]">
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
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[90]">
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
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
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


