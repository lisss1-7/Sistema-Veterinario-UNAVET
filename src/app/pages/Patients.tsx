import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  Camera,
  Upload,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  Phone,
  User,
  Calendar,
} from 'lucide-react';
import type { Patient } from '../utils/types';
import {
  isValidName,
  isValidAgeSpacing,
  isValidPhone,
  sanitizeAgeText,
  sanitizeName,
  sanitizePhone,
} from '../utils/formValidation';
import {
  getPatientCatalogs,
  getPatientsList,
} from '../utils/patientsModuleData';

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

type PatientFormData = Partial<Patient> & {
  photo?: string;
};

type PatientsProps = {
  mode?: 'list' | 'register';
};

type PatientSortOrder =
  | 'pet-asc'
  | 'pet-desc'
  | 'tutor-asc'
  | 'tutor-desc'
  | 'registration-desc'
  | 'registration-asc';

const PAGE_SIZE_OPTIONS = [8, 12, 24];

export default function Patients({ mode = 'list' }: PatientsProps) {
  const navigate = useNavigate();
  const isRegistrationPage = mode === 'register';
  const [patients, setPatients] = useState<PatientFormData[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  const [speciesOptions, setSpeciesOptions] = useState<CatalogItem[]>([]);
  const [breedOptions, setBreedOptions] = useState<CatalogItem[]>([]);
  const [sexOptions, setSexOptions] = useState<CatalogItem[]>([]);
  const [reproductiveStatusOptions, setReproductiveStatusOptions] = useState<CatalogItem[]>([]);

  const [selectedBreedOption, setSelectedBreedOption] = useState('');
  const [customBreed, setCustomBreed] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecies, setFilterSpecies] = useState('');
  const [sortOrder, setSortOrder] = useState<PatientSortOrder>('pet-asc');
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<PatientFormData | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingPatient, setEditingPatient] = useState<PatientFormData | null>(null);
  const [formData, setFormData] = useState<PatientFormData>({});

  useEffect(() => {
    loadPatients();
    loadCatalogs();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterSpecies, sortOrder, pageSize]);

  const loadPatients = async () => {
    try {
      const data = await getPatientsList();
      setPatients(data);
    } catch (error) {
      console.error('Error al cargar pacientes:', error);
      setPatients([]);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const loadCatalogs = async () => {
    try {
      const data = await getPatientCatalogs();
      setSpeciesOptions(data.species);
      setSexOptions(data.sexes);
      setReproductiveStatusOptions(data.reproductiveStatuses);
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setSpeciesOptions([]);
      setSexOptions([]);
      setReproductiveStatusOptions([]);
    }
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
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar razas');
      }

      setBreedOptions(data);
    } catch (error) {
      console.error('Error al cargar razas:', error);
      setBreedOptions([]);
    }
  };

  const filteredPatients = patients.filter((p) => {
    const petName = p.petName || '';
    const tutorName = p.tutorName || '';
    const breed = p.breed || '';

    const matchesSearch =
      petName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tutorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      breed.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSpecies = !filterSpecies || p.species === filterSpecies;

    return matchesSearch && matchesSpecies;
  });

  const compareText = (left?: string, right?: string) =>
    (left || '').localeCompare(right || '', 'es', { sensitivity: 'base' });

  const patientDate = (value?: string) => {
    const timestamp = Date.parse(value || '');
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const sortedPatients = [...filteredPatients].sort((left, right) => {
    switch (sortOrder) {
      case 'pet-desc':
        return compareText(right.petName, left.petName);
      case 'tutor-asc':
        return compareText(left.tutorName, right.tutorName);
      case 'tutor-desc':
        return compareText(right.tutorName, left.tutorName);
      case 'registration-desc':
        return patientDate(right.registrationDate) - patientDate(left.registrationDate);
      case 'registration-asc':
        return patientDate(left.registrationDate) - patientDate(right.registrationDate);
      default:
        return compareText(left.petName, right.petName);
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedPatients.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const firstPatientIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPatients = sortedPatients.slice(
    firstPatientIndex,
    firstPatientIndex + pageSize
  );
  const firstVisiblePatient = sortedPatients.length === 0 ? 0 : firstPatientIndex + 1;
  const lastVisiblePatient = Math.min(
    firstPatientIndex + pageSize,
    sortedPatients.length
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePhotoUpload = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Debe seleccionar una imagen válida');
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setFormData({
        ...formData,
        photo: reader.result as string,
      });
    };

    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setFormData({
      ...formData,
      photo: '',
    });
  };

  const handleBreedSelection = (selectedBreed: string) => {
    setSelectedBreedOption(selectedBreed);

    if (selectedBreed === 'Otra') {
      setFormData({
        ...formData,
        breed: customBreed,
      });
      return;
    }

    setCustomBreed('');
    setFormData({
      ...formData,
      breed: selectedBreed,
    });
  };

  const handleCustomBreedChange = (value: string) => {
    const sanitizedValue = sanitizeName(value);
    setCustomBreed(sanitizedValue);

    setFormData({
      ...formData,
      breed: sanitizedValue,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    if (selectedBreedOption === 'Otra' && !customBreed.trim()) {
      alert('Debe especificar la raza del paciente.');
      return;
    }

    if (!String(formData.age || '').trim()) {
      alert('Debe escribir la edad del paciente.');
      return;
    }

    if (!isValidAgeSpacing(formData.age)) {
      alert('Separe el número de la unidad de edad. Ejemplo: 2 años.');
      return;
    }

    try {
      const url = editingPatient
        ? `${API_URL}/pacientes/${editingPatient.id}`
        : `${API_URL}/pacientes`;

      const method = editingPatient ? 'PUT' : 'POST';

      const patientPayload = {
        ...formData,
        age: String(formData.age).trim(),
        breed:
          selectedBreedOption === 'Otra'
            ? customBreed.trim()
            : formData.breed,
      };

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(patientPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Error al guardar paciente');
      }

      setSuccessMessage(
        editingPatient
          ? 'Paciente actualizado correctamente'
          : 'Paciente agregado correctamente'
      );

      await loadPatients();
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar paciente:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Revisa la consola o el backend.';

      alert(`No se pudo guardar el paciente. ${message}`);
    }
  };

  const resetForm = () => {
    setEditingPatient(null);
    setFormData({});
    setSelectedBreedOption('');
    setCustomBreed('');
    setBreedOptions([]);
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowModal(false);
    resetForm();

    if (isRegistrationPage) {
      navigate('/patients');
    }
  };

  const requestDelete = (patient: PatientFormData) => {
    setPatientToDelete(patient);
  };

  const cancelDelete = () => {
    setPatientToDelete(null);
  };

  const confirmDelete = async () => {
    if (!patientToDelete?.id) return;

    try {
      const response = await fetch(`${API_URL}/pacientes/${patientToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Error al eliminar paciente');
      }

      setPatientToDelete(null);
      await loadPatients();
    } catch (error) {
      console.error('Error al eliminar paciente:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Revisa la consola o el backend.';

      alert(`No se pudo eliminar el paciente. ${message}`);
    }
  };

  const openModal = (patient?: PatientFormData) => {
    if (patient) {
      setEditingPatient(patient);
      setFormData(patient);
      setSelectedBreedOption(patient.breed || '');
      setCustomBreed('');

      if (patient.species) {
        loadBreedsBySpecies(patient.species);
      }
    } else {
      resetForm();
    }

    setShowModal(true);
  };

  const cancelForm = () => {
    setShowModal(false);
    resetForm();

    if (isRegistrationPage) {
      navigate('/patients');
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            {isRegistrationPage ? 'Registrar paciente' : 'Pacientes'}
          </h1>
        </div>
      </div>

      {!isRegistrationPage && <>
      <div className="bg-card rounded-xl p-4 md:p-6 shadow-lg mb-6 border border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
              Filtrar por especie
            </label>

            <select
              value={filterSpecies}
              onChange={(e) => setFilterSpecies(e.target.value)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="">Todas</option>

              {speciesOptions.map((species) => (
                <option key={species.especie_id} value={species.nombre}>
                  {species.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2 text-sm">
              Ordenar por
            </label>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as PatientSortOrder)}
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            >
              <option value="pet-asc">Mascota: A a Z</option>
              <option value="pet-desc">Mascota: Z a A</option>
              <option value="tutor-asc">Tutor: A a Z</option>
              <option value="tutor-desc">Tutor: Z a A</option>
              <option value="registration-desc">Registro: más reciente</option>
              <option value="registration-asc">Registro: más antiguo</option>
            </select>
          </div>
        </div>
      </div>

      {isLoadingPatients ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`patient-skeleton-${index}`}
              className="h-[430px] animate-pulse rounded-2xl border border-border bg-card shadow-lg"
            />
          ))}
        </div>
      ) : sortedPatients.length > 0 ? (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {paginatedPatients.map((patient) => (
            <div
              key={patient.id}
              className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 group"
            >
              <div className="relative h-56 bg-secondary overflow-hidden">
                {patient.photo ? (
                  <img
                    src={patient.photo}
                    alt={`Foto de ${patient.petName}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-muted-foreground">
                    <Camera className="mb-3 h-14 w-14" strokeWidth={1.6} />
                    <p className="text-sm">
                      Sin foto registrada
                    </p>
                  </div>
                )}

                <div className="absolute top-3 left-3">
                  <span className="px-3 py-1 rounded-full bg-foreground/80 backdrop-blur-sm text-[#F7EFE6] text-xs">
                    {patient.species || 'Sin especie'}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-4">
                  <h3 className="text-foreground text-xl font-semibold">
                    {patient.petName || 'Sin nombre'}
                  </h3>

                  <p className="text-muted-foreground text-sm mt-1">
                    {patient.breed || 'Raza no especificada'} ·{' '}
                    {patient.age || 'Edad no especificada'}
                  </p>
                </div>

                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4 text-primary" />
                    <span>Tutor: {patient.tutorName || 'N/A'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4 text-primary" />
                    <span>{patient.tutorPhone || 'Sin teléfono'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>Última visita: {patient.lastVisit || 'N/A'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
                  <Link
                    to={`/patients/${patient.id}`}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-2 text-xs font-semibold text-[#F7EFE6] transition-colors hover:bg-primary/90 sm:gap-2 sm:text-sm"
                  >
                    <Eye className="h-4 w-4 shrink-0" />
                    Ver
                  </Link>

                  <button
                    type="button"
                    onClick={() => openModal(patient)}
                    aria-label={`Editar a ${patient.petName || 'este paciente'}`}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-border px-2 py-2 text-xs font-semibold text-primary transition-colors hover:bg-secondary sm:gap-2 sm:text-sm"
                  >
                    <Edit className="h-4 w-4 shrink-0" />
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => requestDelete(patient)}
                    aria-label={`Eliminar a ${patient.petName || 'este paciente'}`}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 sm:gap-2 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Mostrando {firstVisiblePatient}-{lastVisiblePatient} de{' '}
            {sortedPatients.length} pacientes
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Por página
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className="px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>

              <span className="min-w-24 text-center text-sm text-muted-foreground">
                Página {safeCurrentPage} de {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                disabled={safeCurrentPage === totalPages}
                className="px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
        </>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-10 text-center shadow-lg">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-primary" strokeWidth={1.7} />
          <h3 className="text-foreground text-lg font-medium">
            No hay pacientes registrados
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            Agrega un nuevo paciente para visualizarlo en este módulo.
          </p>
        </div>
      )}
      </>}

      {(showModal || isRegistrationPage) && (
        <div className={isRegistrationPage ? '' : 'modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50'}>
          <div className={`bg-card border border-border rounded-xl p-4 md:p-6 w-full shadow-2xl ${isRegistrationPage ? 'max-w-4xl mx-auto' : 'max-w-3xl max-h-[90vh] overflow-y-auto'}`}>
            <h2 className="text-foreground text-xl mb-4">
              {editingPatient ? 'Editar paciente' : 'Datos del nuevo paciente'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-muted border border-border rounded-xl p-4">
                <label className="block text-foreground mb-3 text-sm font-medium">
                  Foto de perfil del paciente
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {formData.photo ? (
                    <img
                      src={formData.photo}
                      alt="Foto del paciente"
                      className="w-28 h-28 rounded-2xl object-cover border-4 border-border shadow-md"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-2xl bg-secondary border-4 border-border flex items-center justify-center">
                      <Camera className="w-10 h-10 text-primary" />
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="text-muted-foreground text-sm mb-3">
                      Puedes tomar una foto desde la cámara o seleccionar una imagen del dispositivo.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <label className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg cursor-pointer transition-colors text-sm">
                        <Camera className="w-4 h-4" />
                        Tomar foto

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>

                      <label className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg cursor-pointer transition-colors text-sm">
                        <Upload className="w-4 h-4" />
                        Subir imagen

                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>

                      {formData.photo && (
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                        >
                          Quitar foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Nombre de la mascota
                  </label>

                  <input
                    type="text"
                    value={formData.petName || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, petName: sanitizeName(e.target.value) })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Especie
                  </label>

                  <select
                    value={formData.species || ''}
                    onChange={(e) => {
                      const selectedSpecies = e.target.value;

                      setFormData({
                        ...formData,
                        species: selectedSpecies,
                        breed: '',
                      });

                      setSelectedBreedOption('');
                      setCustomBreed('');
                      loadBreedsBySpecies(selectedSpecies);
                    }}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar</option>

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
                    onChange={(e) => handleBreedSelection(e.target.value)}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">
                      {formData.species ? 'Seleccionar raza' : 'Seleccione una especie primero'}
                    </option>

                    {breedOptions.map((breed) => (
                      <option key={breed.raza_id} value={breed.nombre}>
                        {breed.nombre}
                      </option>
                    ))}
                  </select>

                  {selectedBreedOption === 'Otra' && (
                    <div className="mt-3">
                      <label className="block text-foreground mb-2 text-sm">
                        Especifique la raza
                      </label>

                      <input
                        type="text"
                        value={customBreed}
                        onChange={(e) => handleCustomBreedChange(e.target.value)}
                        placeholder="Ingrese la raza"
                        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Edad
                  </label>

                  <input
                    type="text"
                    value={formData.age || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: sanitizeAgeText(e.target.value),
                      })
                    }
                    placeholder="Ejemplo: 3 años, 8 meses"
                    maxLength={50}
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                  
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Sexo
                  </label>

                  <select
                    value={formData.sex || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, sex: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar</option>

                    {sexOptions.map((sex) => (
                      <option key={sex.sexo_id} value={sex.nombre}>
                        {sex.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Estado reproductivo
                  </label>

                  <select
                    value={formData.reproductiveStatus || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, reproductiveStatus: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar</option>

                    {reproductiveStatusOptions.map((status) => (
                      <option
                        key={status.estado_reproductivo_id}
                        value={status.nombre}
                      >
                        {status.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Alimentación (qué come)
                  </label>

                  <input
                    type="text"
                    value={formData.diet || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, diet: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Color
                  </label>

                  <input
                    type="text"
                    value={formData.color || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, color: sanitizeName(e.target.value) })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>

                {([
                  ['Primer nombre del tutor', 'tutorFirstName', true],
                  ['Segundo nombre del tutor', 'tutorMiddleName', false],
                  ['Primer apellido del tutor', 'tutorFirstSurname', true],
                  ['Segundo apellido del tutor', 'tutorSecondSurname', false],
                ] as const).map(([label, field, required]) => (
                  <div key={field}>
                    <label className="block text-foreground mb-2 text-sm">
                      {label}{required ? ' *' : ' (opcional)'}
                    </label>

                    <input
                      type="text"
                      value={formData[field] || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field]: sanitizeName(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                      required={required}
                      minLength={required ? 2 : undefined}
                      maxLength={80}
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Teléfono del tutor
                  </label>

                  <input
                    type="tel"
                    value={formData.tutorPhone || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, tutorPhone: sanitizePhone(e.target.value) })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{8,15}"
                    minLength={8}
                    maxLength={15}
                    title="Ingrese entre 8 y 15 dígitos, sin letras."
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Correo del tutor
                  </label>

                  <input
                    type="email"
                    value={formData.tutorEmail || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, tutorEmail: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Dirección del tutor
                  </label>

                  <input
                    type="text"
                    value={formData.tutorAddress || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, tutorAddress: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  />
                </div>
              </div>

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
                  rows={3}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingPatient ? 'Actualizar' : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={cancelForm}
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
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue guardada exitosamente en el módulo de pacientes.
            </p>

            <button
              onClick={closeSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {patientToDelete && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[60]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Eliminar paciente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              ¿Deseas eliminar a {patientToDelete.petName || 'este paciente'} del módulo de pacientes?
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RegisterPatient() {
  return <Patients mode="register" />;
}


