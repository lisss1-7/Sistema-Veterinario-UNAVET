import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Scissors,
  Truck,
  Wallet,
  MapPin,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
} from 'lucide-react';
import type { GroomingAppointment } from '../utils/types';
import SearchablePatientSelect from '../components/SearchablePatientSelect';
import {
  getTodayLocal,
  isValidName,
  isValidPhone,
  isValidAgeSpacing,
  isNonNegativeNumber,
  sanitizeAgeText,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';

type GroomingFormData = Partial<GroomingAppointment> & {
  patientId?: string;
  species?: string;
};

type DeleteTarget = {
  id: string;
  petName: string;
  date: string;
  time: string;
};

type InfoModalType = 'transportLimit' | 'timeConflict' | null;

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

export default function Grooming() {
  const [grooming, setGrooming] = useState<GroomingAppointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingGrooming, setEditingGrooming] =
    useState<GroomingAppointment | null>(null);

  const [formData, setFormData] = useState<GroomingFormData>({});

  const [patients, setPatients] = useState<any[]>([]);
  const [groomingTypeCatalog, setGroomingTypeCatalog] = useState<CatalogItem[]>([]);
  const [groomingTypeOptions, setGroomingTypeOptions] = useState<string[]>([]);
  const [groomingStatusOptions, setGroomingStatusOptions] = useState<string[]>([]);
  const [animalSizeOptions, setAnimalSizeOptions] = useState<string[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<CatalogItem[]>([]);
  const [breedOptions, setBreedOptions] = useState<CatalogItem[]>([]);
  const [selectedBreedOption, setSelectedBreedOption] = useState('');
  const [customBreed, setCustomBreed] = useState('');
  const [currentTimeSlots, setCurrentTimeSlots] = useState<string[]>([]);
  const [transportCapacity, setTransportCapacity] = useState(0);
  const [stats, setStats] = useState({
    inClinic: 0,
    withTransport: 0,
    estimatedIncome: 0,
    availableTransport: 0,
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [infoModalType, setInfoModalType] = useState<InfoModalType>(null);

  useEffect(() => {
    loadGrooming();
    loadPatients();
    loadCatalogs();
  }, []);

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
    await Promise.all([
      (async () => {
        const response = await fetch(`${API_URL}/catalogos/tipos-grooming`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        const catalog = Array.isArray(data) ? data : [];
        setGroomingTypeCatalog(catalog);
        setGroomingTypeOptions(mapCatalogNames(catalog));
      })(),
      fetchCatalogSafely('estados-grooming', setGroomingStatusOptions),
      fetchCatalogSafely('tamanos-animales', setAnimalSizeOptions),
      (async () => {
        const response = await fetch(`${API_URL}/catalogos/especies`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setSpeciesOptions(Array.isArray(data) ? data : []);
      })(),
    ]);
  };

  const loadBreedsBySpecies = async (speciesName: string) => {
    const selectedSpecies = speciesOptions.find(
      (species) => species.nombre === speciesName
    );

    if (!selectedSpecies) {
      setBreedOptions([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/catalogos/razas/${selectedSpecies.especie_id}`,
        { headers: getAuthHeaders() }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar razas');
      }

      setBreedOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar razas:', error);
      setBreedOptions([]);
    }
  };

  const loadSchedule = async (
    date: string,
    typeId: string | number
  ) => {
    const response = await fetch(
      `${API_URL}/catalogos/horarios?modulo=grooming&fecha=${encodeURIComponent(
        date
      )}&tipoGroomingId=${encodeURIComponent(String(typeId))}`,
      { headers: getAuthHeaders() }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data as { slots: string[]; capacity: number | null };
  };

  useEffect(() => {
    if (!formData.type && groomingTypeOptions.length > 0) {
      setFormData((prev) => ({
        ...prev,
        type: groomingTypeOptions[0],
      }));
    }
  }, [groomingTypeOptions, formData.type]);

  useEffect(() => {
    const type = groomingTypeCatalog.find(
      (item) => item.nombre === formData.type
    );
    if (!formData.date || !type?.id) {
      setCurrentTimeSlots([]);
      return;
    }
    void loadSchedule(formData.date, type.id)
      .then((data) => setCurrentTimeSlots(data.slots || []))
      .catch(() => setCurrentTimeSlots([]));
  }, [formData.date, formData.type, groomingTypeCatalog]);

  useEffect(() => {
    const transportType = groomingTypeCatalog.find((item) =>
      isTransportType(item.nombre)
    );
    if (!transportType?.id) return;
    void loadSchedule(new Date().toISOString().split('T')[0], transportType.id)
      .then((data) => setTransportCapacity(Number(data.capacity || 0)))
      .catch(() => setTransportCapacity(0));
  }, [groomingTypeCatalog]);

  const getDefaultGroomingType = () => groomingTypeOptions[0] || '';

  const isTransportType = (type?: string) => {
    return type?.toLowerCase().includes('transporte') || false;
  };

  const isClinicType = (type?: string) => {
    const normalizedType = type?.toLowerCase() || '';
    return normalizedType.includes('clínica') || normalizedType.includes('clinica');
  };

  const isCancelledStatus = (status?: string) => {
    return status?.toLowerCase() === 'cancelada';
  };

  const getStatusClass = (status?: string) => {
    const normalizedStatus = status?.toLowerCase() || '';

    if (normalizedStatus.includes('confirmada')) {
      return 'bg-green-100 text-green-800';
    }

    if (normalizedStatus.includes('pendiente')) {
      return 'bg-yellow-100 text-yellow-800';
    }

    if (normalizedStatus.includes('completada')) {
      return 'bg-blue-100 text-blue-800';
    }

    if (normalizedStatus.includes('cancelada')) {
      return 'bg-gray-100 text-gray-800';
    }

    return 'bg-gray-100 text-gray-800';
  };

  const getTypeClass = (type?: string) => {
    return isClinicType(type)
      ? 'bg-blue-100 text-blue-800'
      : 'bg-purple-100 text-purple-800';
  };

  const getTypeLabel = (type?: string) => {
    if (isClinicType(type)) return 'En clínica';
    if (isTransportType(type)) return 'Con transporte';
    return type || 'Sin tipo';
  };

  const loadGrooming = async () => {
    try {
      const response = await fetch(`${API_URL}/grooming`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar citas de grooming');
      }

      setGrooming(data);
      calculateStats(data);
    } catch (error) {
      console.error('Error al cargar citas de grooming:', error);
      setGrooming([]);
      calculateStats([]);
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

  const calculateStats = (data: GroomingAppointment[]) => {
    const today = new Date().toISOString().split('T')[0];

    const todayGrooming = data.filter(
      (g: GroomingAppointment) => g.date === today
    );

    const inClinic = todayGrooming.filter((g: GroomingAppointment) =>
      isClinicType(g.type)
    ).length;

    const withTransport = todayGrooming.filter((g: GroomingAppointment) =>
      isTransportType(g.type)
    ).length;

    const estimatedIncome = todayGrooming.reduce((sum, g) => {
      return sum + Number(g.groomingCost || 0) + Number(g.transportCost || 0);
    }, 0);

    setStats({
      inClinic,
      withTransport,
      estimatedIncome,
      availableTransport: Math.max(0, transportCapacity - withTransport),
    });
  };

  useEffect(() => {
    calculateStats(grooming);
  }, [transportCapacity]);

  const filteredGrooming = grooming.filter((g) => {
    const petName = g.petName || '';
    const tutorName = g.tutorName || '';

    const matchesSearch =
      petName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tutorName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = !filterType || g.type === filterType;
    const matchesStatus = !filterStatus || g.status === filterStatus;
    const matchesDate = !filterDate || g.date === filterDate;

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  const isTimeUnavailable = (time: string) => {
    return grooming.some(
      (g: GroomingAppointment) =>
        g.date === formData.date &&
        g.time === time &&
        !isCancelledStatus(g.status) &&
        g.id !== editingGrooming?.id
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
    if (!formData.patientId && !String(formData.age || '').trim()) {
      alert('Debe escribir la edad de la mascota.');
      return;
    }
    if (!isValidAgeSpacing(formData.age)) {
      alert('Separe el número de la unidad de edad. Ejemplo: 2 años.');
      return;
    }
    if (
      !isNonNegativeNumber(formData.groomingCost) ||
      (isTransportType(formData.type) && !isNonNegativeNumber(formData.transportCost))
    ) {
      alert('Los costos deben ser números válidos mayores o iguales a cero.');
      return;
    }

    try {
      const url = editingGrooming
        ? `${API_URL}/grooming/${editingGrooming.id}`
        : `${API_URL}/grooming`;

      const method = editingGrooming ? 'PUT' : 'POST';
      const groomingPayload = {
        ...formData,
        age: String(formData.age || '').trim(),
      };

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(groomingPayload),
      });

      const data = await response.json();

      if (response.status === 409) {
        setInfoModalType(
          data.code === 'TRANSPORT_LIMIT' ? 'transportLimit' : 'timeConflict'
        );
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Error al guardar grooming');
      }

      await loadGrooming();

      setSuccessMessage(
        editingGrooming
          ? 'Cita de grooming actualizada correctamente'
          : 'Cita de grooming creada correctamente'
      );

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar grooming:', error);
      alert('No se pudo guardar la cita de grooming. Revisa el backend o la consola.');
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowModal(false);
    setEditingGrooming(null);
    setFormData({ type: getDefaultGroomingType() });
    setBreedOptions([]);
    setSelectedBreedOption('');
    setCustomBreed('');
  };

  const openDeleteModal = (groom: GroomingAppointment) => {
    setDeleteTarget({
      id: groom.id,
      petName: groom.petName || 'la mascota',
      date: groom.date,
      time: groom.time,
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
      const response = await fetch(`${API_URL}/grooming/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al eliminar cita de grooming');
      }

      await loadGrooming();

      setShowDeleteModal(false);
      setDeleteTarget(null);
      setShowDeleteSuccessModal(true);
    } catch (error) {
      console.error('Error al eliminar grooming:', error);
      alert('No se pudo eliminar la cita de grooming.');
    }
  };

  const closeDeleteSuccessModal = () => {
    setShowDeleteSuccessModal(false);
  };

  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_URL}/grooming/${id}/estado`, {
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

      await loadGrooming();
    } catch (error) {
      console.error('Error al cambiar estado de grooming:', error);
      alert('No se pudo cambiar el estado de la cita de grooming.');
    }
  };

  const openModal = (groomingItem?: GroomingAppointment) => {
    if (groomingItem) {
      const linkedPatient = patients.find(
        (patient) => patient.id === (groomingItem as GroomingFormData).patientId
      );
      const species = linkedPatient?.species || '';

      setEditingGrooming(groomingItem);
      setFormData({ ...groomingItem, species });
      setSelectedBreedOption(groomingItem.breed || '');
      setCustomBreed('');

      if (species) {
        void loadBreedsBySpecies(species);
      } else {
        setBreedOptions([]);
      }
    } else {
      setEditingGrooming(null);
      setBreedOptions([]);
      setSelectedBreedOption('');
      setCustomBreed('');
      setFormData({
        type: getDefaultGroomingType(),
        date: new Date().toISOString().split('T')[0],
      });
    }

    setShowModal(true);
  };

  const closeFormModal = () => {
    setShowModal(false);
    setEditingGrooming(null);
    setFormData({ type: getDefaultGroomingType() });
    setBreedOptions([]);
    setSelectedBreedOption('');
    setCustomBreed('');
  };

  const closeInfoModal = () => {
    setInfoModalType(null);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            Grooming
          </h1>
        </div>

        <button
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-primary to-primary hover:from-[#7a5f3c] hover:to-primary text-[#F7EFE6] rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
        >
          <Plus className="w-4 h-4 drop-shadow-sm" strokeWidth={2.5} />
          Nueva cita de grooming
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-primary to-muted-foreground text-white rounded-xl p-4 md:p-5 shadow-xl transform transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1 font-medium">
                Grooming en clínica hoy
              </p>
              <p className="text-3xl font-bold drop-shadow-md">{stats.inClinic}</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Scissors className="w-10 h-10 drop-shadow-md" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-muted-foreground to-muted-foreground text-white rounded-xl p-4 md:p-5 shadow-xl transform transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1 font-medium">Con transporte hoy</p>
              <p className="text-3xl font-bold drop-shadow-md">{stats.withTransport}</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Truck className="w-10 h-10 drop-shadow-md" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-accent to-[#d4a574] text-white rounded-xl p-4 md:p-5 shadow-xl transform transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1 font-medium">
                Ingresos estimados hoy
              </p>
              <p className="text-3xl font-bold drop-shadow-md">Q{stats.estimatedIncome}</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Wallet className="w-10 h-10 drop-shadow-md" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary to-primary text-white rounded-xl p-4 md:p-5 shadow-xl transform transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1 font-medium">
                Domicilios disponibles
              </p>
              <p className="text-3xl font-bold drop-shadow-md">
                {stats.availableTransport}/{transportCapacity}
              </p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <MapPin className="w-10 h-10 drop-shadow-md" strokeWidth={2} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 md:p-6 shadow-lg mb-6 border border-border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                placeholder="Buscar por mascota o tutor"
                className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Tipo
            </label>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="">Todos</option>

              {groomingTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
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

              {groomingStatusOptions.map((status) => (
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

      <div className="lg:hidden space-y-4">
        {filteredGrooming.map((groom) => (
          <article
            key={groom.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/10"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {groom.date} • {groom.time}
                </p>
                <h3 className="text-foreground text-lg font-semibold">
                  {groom.petName}
                </h3>
                <p className="text-sm text-muted-foreground">{groom.tutorName}</p>
              </div>

              <span className={`px-3 py-2 rounded-full text-xs ${getTypeClass(groom.type)}`}>
                {getTypeLabel(groom.type)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p className="text-foreground font-medium">{groom.tutorPhone}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Costo grooming</p>
                <p className="text-foreground font-medium">Q{groom.groomingCost}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Transporte</p>
                <p className="text-foreground font-medium">
                  {groom.transportCost ? `Q${groom.transportCost}` : 'No aplica'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <select
                value={groom.status}
                onChange={(e) => changeStatus(groom.id, e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-sm border border-transparent ${getStatusClass(
                  groom.status
                )}`}
              >
                {groomingStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => openModal(groom)}
                className="flex-1 px-4 py-2 bg-secondary hover:bg-border text-primary rounded-xl transition-colors"
                title="Editar"
              >
                Editar
              </button>

              <button
                onClick={() => openDeleteModal(groom)}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors"
                title="Eliminar"
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}

        {filteredGrooming.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            No hay citas de grooming registradas.
          </div>
        )}
      </div>

      <div className="hidden lg:block bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-primary text-[#F7EFE6]">
              <tr>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Hora</th>
                <th className="px-6 py-3 text-left">Tipo</th>
                <th className="px-6 py-3 text-left">Mascota</th>
                <th className="px-6 py-3 text-left">Tutor</th>
                <th className="px-6 py-3 text-left">Teléfono</th>
                <th className="px-6 py-3 text-left">Costos</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filteredGrooming.map((groom) => (
                <tr key={groom.id} className="hover:bg-muted">
                  <td className="px-6 py-4 text-foreground">
                    {groom.date}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {groom.time}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${getTypeClass(
                        groom.type
                      )}`}
                    >
                      {getTypeLabel(groom.type)}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {groom.petName}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {groom.tutorName}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    {groom.tutorPhone}
                  </td>

                  <td className="px-6 py-4 text-foreground">
                    <div className="text-sm">
                      <p>Grooming: Q{groom.groomingCost}</p>

                      {groom.transportCost && (
                        <p>Transporte: Q{groom.transportCost}</p>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <select
                      value={groom.status}
                      onChange={(e) => changeStatus(groom.id, e.target.value)}
                      className={`px-3 py-1 rounded-full text-sm ${getStatusClass(
                        groom.status
                      )}`}
                    >
                      {groomingStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openModal(groom)}
                        className="p-2 bg-secondary hover:bg-border text-primary rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => openDeleteModal(groom)}
                        className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredGrooming.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No hay citas de grooming registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  {editingGrooming
                    ? 'Editar cita de grooming'
                    : 'Nueva cita de grooming'}
                </h2>

                <p className="text-muted-foreground text-sm mt-1">
                  Completa los datos del servicio de grooming.
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
                        species: selectedPatient.species || '',
                        breed: selectedPatient.breed || '',
                        age: selectedPatient.age || '',
                        tutorFirstName: selectedPatient.tutorFirstName || '',
                        tutorMiddleName: selectedPatient.tutorMiddleName || '',
                        tutorFirstSurname: selectedPatient.tutorFirstSurname || '',
                        tutorSecondSurname: selectedPatient.tutorSecondSurname || '',
                        tutorPhone: selectedPatient.tutorPhone || '',
                      });
                      setSelectedBreedOption(selectedPatient.breed || '');
                      setCustomBreed('');

                      void loadBreedsBySpecies(selectedPatient.species || '');
                    } else {
                      setFormData({
                        ...formData,
                        patientId: '',
                        petName: '',
                        species: '',
                        breed: '',
                        age: '',
                        tutorFirstName: '',
                        tutorMiddleName: '',
                        tutorFirstSurname: '',
                        tutorSecondSurname: '',
                        tutorPhone: '',
                      });
                      setBreedOptions([]);
                      setSelectedBreedOption('');
                      setCustomBreed('');
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Tipo de cita
                </label>

                <select
                  value={formData.type || getDefaultGroomingType()}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as any,
                      time: '',
                    })
                  }
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  required
                >
                  <option value="">Seleccionar tipo</option>

                  {groomingTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    setFormData({ ...formData, date: value })
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
                  >
                    <option value="">Seleccionar hora</option>

                    {currentTimeSlots.map((time) => {
                      const unavailable = isTimeUnavailable(time);

                      return (
                        <option key={time} value={time} disabled={unavailable}>
                          {unavailable ? `${time} - No disponible` : time}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Especie
                  </label>

                  <select
                    value={formData.species || ''}
                    onChange={(event) => {
                      const species = event.target.value;
                      setFormData({ ...formData, species, breed: '' });
                      setSelectedBreedOption('');
                      setCustomBreed('');
                      void loadBreedsBySpecies(species);
                    }}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar especie</option>
                    {speciesOptions.map((species) => (
                      <option key={species.especie_id} value={species.nombre}>
                        {species.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Raza
                  </label>

                  <select
                    value={selectedBreedOption}
                    onChange={(event) => {
                      const breed = event.target.value;
                      setSelectedBreedOption(breed);
                      setCustomBreed('');
                      setFormData({
                        ...formData,
                        breed: breed === 'Otra' ? '' : breed,
                      });
                    }}
                    disabled={!formData.species}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    <option value="">
                      {formData.species
                        ? 'Seleccionar raza'
                        : 'Seleccione una especie primero'}
                    </option>
                    {breedOptions
                      .filter(
                        (breed) => breed.nombre.toLocaleLowerCase('es-GT') !== 'otra'
                      )
                      .map((breed) => (
                        <option key={breed.raza_id} value={breed.nombre}>
                          {breed.nombre}
                        </option>
                      ))}
                    <option value="Otra">Otra</option>
                  </select>

                  {selectedBreedOption === 'Otra' && (
                    <div className="mt-3">
                      <label className="block text-foreground mb-2 text-sm">
                        Especifique la raza
                      </label>
                      <input
                        type="text"
                        value={customBreed}
                        onChange={(event) => {
                          const breed = sanitizeName(event.target.value);
                          setCustomBreed(breed);
                          setFormData({ ...formData, breed });
                        }}
                        placeholder="Escriba la nueva raza"
                        minLength={2}
                        maxLength={80}
                        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Tamaño de la mascota
                  </label>
                  <select
                    value={formData.animalSize || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        animalSize: event.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar tamaño</option>
                    {animalSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <FormInput
                    label="Edad"
                    value={formData.age || ''}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        age: sanitizeAgeText(value),
                      })
                    }
                    required
                    maxLength={50}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ejemplo: 3 años, 8 meses.
                  </p>
                </div>

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
                  label="Costo del servicio de grooming, Q"
                  type="number"
                  value={formData.groomingCost || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      groomingCost: parseFloat(value) || 0,
                    })
                  }
                  required
                  min={0}
                  step="0.01"
                />
              </div>

              {isTransportType(formData.type) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput
                    label="Costo del transporte, Q"
                    type="number"
                    value={formData.transportCost || ''}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        transportCost: parseFloat(value) || 0,
                      })
                    }
                    required
                    min={0}
                    step="0.01"
                  />

                  <FormInput
                    label="Código de acceso"
                    value={formData.accessCode || ''}
                    onChange={(value) =>
                      setFormData({ ...formData, accessCode: value })
                    }
                  />

                  <div className="md:col-span-2">
                    <FormInput
                      label="Dirección"
                      value={formData.address || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, address: value })
                      }
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Observaciones
                </label>

                <textarea
                  value={formData.observations || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      observations: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  rows={2}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingGrooming ? 'Actualizar' : 'Crear'}
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
              La información fue guardada exitosamente en el módulo de grooming.
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
              Se eliminará la cita de grooming de{' '}
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
              . Esta acción no se puede deshacer.
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
              Cita de grooming eliminada correctamente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La cita fue eliminada exitosamente del módulo de grooming.
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

      {infoModalType && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[90]">
          <ModalCard>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="w-10 h-10 text-yellow-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {infoModalType === 'transportLimit'
                ? 'Límite de transporte alcanzado'
                : 'Horario no disponible'}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              {infoModalType === 'transportLimit'
                ? `Ya se alcanzó el límite diario de ${transportCapacity} servicios de grooming con transporte. Selecciona otra fecha o cambia el tipo de cita.`
                : 'Ya existe una cita de grooming registrada para la fecha y hora seleccionadas. Elige otro horario disponible.'}
            </p>

            <button
              onClick={closeInfoModal}
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
  max,
  step,
  minLength,
  maxLength,
  pattern,
  inputMode,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
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
        max={max}
        step={step}
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


