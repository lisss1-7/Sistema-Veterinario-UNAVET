import { useState, useEffect, useRef } from 'react';
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
  X,
  ChevronDown,
} from 'lucide-react';
import type { Patient } from '../utils/types';
import ThemedSelect from '../components/ThemedSelect';
import { useModulePermissions } from '../hooks/useModulePermissions';
import {
  isValidName,
  isValidPetName,
  isValidEmail,
  isValidAgeSpacing,
  isValidPhone,
  sanitizeAgeText,
  sanitizeName,
  sanitizePetName,
  sanitizePhone,
} from '../utils/formValidation';
import {
  getPatientCatalogs,
  getPatientsList,
} from '../utils/patientsModuleData';
import { API_URL } from '../config/api';

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
  const { permissions } = useModulePermissions('patients');
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
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<PatientFormData | null>(null);
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingPatient, setEditingPatient] = useState<PatientFormData | null>(null);
  const [formData, setFormData] = useState<PatientFormData>({});
  const [isTutorEmailFocused, setIsTutorEmailFocused] = useState(false);
  const [tutorMode, setTutorMode] = useState<'new' | 'existing'>('new');
  const [existingTutors, setExistingTutors] = useState<any[]>([]);
  const [selectedExistingTutorId, setSelectedExistingTutorId] = useState('');
  const [selectedTutorSearch, setSelectedTutorSearch] = useState('');
  const [showTutorSuggestions, setShowTutorSuggestions] = useState(false);
  const [highlightedTutorId, setHighlightedTutorId] = useState<string | null>(null);
  const [showSpeciesMenu, setShowSpeciesMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const photoGalleryInputRef = useRef<HTMLInputElement>(null);
  const photoCameraInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadPatients();
    loadCatalogs();
    loadExistingTutors();
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

  const loadExistingTutors = async () => {
    try {
      const response = await fetch(`${API_URL}/tutores`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar tutores');
      }

      const tutors = data || [];
      setExistingTutors(tutors);
      return tutors;
    } catch (error) {
      console.error('Error al cargar tutores:', error);
      setExistingTutors([]);
      return [];
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

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Error al leer imagen'));
        reader.onload = () => {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onerror = () => reject(new Error('Imagen inválida'));
            img.onload = () => {
              try {
                let { width, height } = img;
                if (!width || !height) {
                  resolve(reader.result as string);
                  return;
                }
                const maxSize = 800;
                if (width > maxSize || height > maxSize) {
                  if (width > height) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                  } else {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                  }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: false } as any);
                if (!ctx) {
                  resolve(reader.result as string);
                  return;
                }
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                try {
                  let compressed = canvas.toDataURL('image/jpeg', 0.65);
                  if (compressed.length > 1.2 * 1024 * 1024) {
                    compressed = canvas.toDataURL('image/jpeg', 0.45);
                  }
                  if (compressed.length > 7 * 1024 * 1024) {
                    reject(new Error('La imagen sigue siendo muy grande. Elige una más pequeña.'));
                    return;
                  }
                  resolve(compressed);
                } catch {
                  resolve(reader.result as string);
                }
              } catch {
                resolve(reader.result as string);
              }
            };
            img.src = reader.result as string;
          } catch {
            reject(new Error('No se pudo procesar la imagen'));
          }
        };
        reader.readAsDataURL(file);
      } catch {
        reject(new Error('No se pudo leer la imagen'));
      }
    });
  };

  const handlePhotoUpload = async (file?: File) => {
    if (!file) return;

    const isImage = file.type
      ? file.type.startsWith('image/')
      : /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
    if (!isImage) {
      alert('Debe seleccionar una imagen válida');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('La imagen es demasiado grande (más de 15MB). Elige una más pequeña.');
      return;
    }

    try {
      const compressedPhoto = await compressImage(file);
      if (compressedPhoto.length > 6 * 1024 * 1024) {
        alert('La imagen sigue siendo muy grande. Intenta con otra foto más pequeña o sin foto.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        photo: compressedPhoto,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo procesar la imagen';
      alert(msg);
      if (file.size > 2 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.length > 7 * 1024 * 1024) {
          alert('La imagen es demasiado grande para enviar. Elige otra más pequeña.');
          return;
        }
        setFormData((prev) => ({
          ...prev,
          photo: result,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoAreaClick = () => {
    const isMobileDevice =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(pointer: coarse)').matches);

    if (isMobileDevice) {
      photoCameraInputRef.current?.click();
    } else {
      photoGalleryInputRef.current?.click();
    }
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

  const getTutorLabel = (tutor: any) =>
    `${tutor.nombre_completo || `${tutor.primer_nombre || ''} ${tutor.primer_apellido || ''}`.trim()} · ${tutor.telefono || 'Sin teléfono'}`;

  const filteredTutorSuggestions = existingTutors.filter((tutor) => {
    const searchValue = selectedTutorSearch.trim().toLowerCase();

    if (!searchValue) {
      return true;
    }

    const label = getTutorLabel(tutor).toLowerCase();
    const phone = (tutor.telefono || '').toLowerCase();

    return label.includes(searchValue) || phone.includes(searchValue);
  });

  const handleTutorSelection = (tutorId: string) => {
    const selectedTutor = existingTutors.find((tutor) => String(tutor.id) === String(tutorId));

    if (!selectedTutor) {
      return;
    }

    setSelectedExistingTutorId(String(tutorId));
    setSelectedTutorSearch(getTutorLabel(selectedTutor));
    setShowTutorSuggestions(false);
    setFormData({
      ...formData,
      tutorId: String(tutorId),
      tutorFirstName: selectedTutor.primer_nombre || '',
      tutorMiddleName: selectedTutor.segundo_nombre || '',
      tutorFirstSurname: selectedTutor.primer_apellido || '',
      tutorSecondSurname: selectedTutor.segundo_apellido || '',
      tutorPhone: selectedTutor.telefono || '',
      tutorEmail: selectedTutor.correo || '',
      tutorAddress: selectedTutor.direccion || '',
    });
  };

  const handleTutorSearchInput = (value: string) => {
    setSelectedTutorSearch(value);
    setShowTutorSuggestions(true);
    setHighlightedTutorId(null);

    const selectedTutor = existingTutors.find((tutor) => getTutorLabel(tutor) === value);

    if (!selectedTutor) {
      setSelectedExistingTutorId('');
      setFormData((current) => ({ ...current, tutorId: undefined }));
      return;
    }

    handleTutorSelection(String(selectedTutor.id));
  };

  const handleTutorKeyNavigation = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showTutorSuggestions || filteredTutorSuggestions.length === 0) {
      return;
    }

    const currentIndex = filteredTutorSuggestions.findIndex(
      (tutor) => String(tutor.id) === highlightedTutorId
    );

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
      const nextTutor = filteredTutorSuggestions[nextIndex % filteredTutorSuggestions.length];
      setHighlightedTutorId(String(nextTutor.id));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex = currentIndex > 0 ? currentIndex - 1 : filteredTutorSuggestions.length - 1;
      const previousTutor = filteredTutorSuggestions[previousIndex];
      setHighlightedTutorId(String(previousTutor.id));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const tutorToSelect = highlightedTutorId
        ? filteredTutorSuggestions.find((tutor) => String(tutor.id) === highlightedTutorId)
        : filteredTutorSuggestions[0];

      if (tutorToSelect) {
        handleTutorSelection(String(tutorToSelect.id));
      }
    }

    if (event.key === 'Escape') {
      setShowTutorSuggestions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    const isExistingTutorFlow = tutorMode === 'existing';

    if (!isValidPetName(formData.petName)) {
      setFormError({
        title: 'Revisa el nombre de la mascota',
        message: 'Puede contener letras y números y debe tener entre 2 y 80 caracteres.',
      });
      return;
    }

    if (!isExistingTutorFlow) {
      if (!isValidEmail(formData.tutorEmail)) {
        setFormError({
          title: 'Revisa el correo del tutor',
          message: 'Ingresa un correo con el formato nombre@dominio.com.',
        });
        return;
      }
      if (
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

      if (!isValidPhone(formData.tutorPhone)) {
        setFormError({
          title: 'Teléfono inválido',
          message: 'El teléfono debe contener únicamente entre 8 y 15 dígitos.',
        });
        return;
      }
    } else if (!selectedExistingTutorId) {
      setFormError({
        title: 'Falta el tutor',
        message: 'Debe seleccionar un tutor existente para continuar.',
      });
      return;
    }

    if (selectedBreedOption === 'Otra' && !customBreed.trim()) {
      setFormError({
        title: 'Falta la raza',
        message: 'Debe especificar la raza del paciente.',
      });
      return;
    }

    if (!String(formData.age || '').trim()) {
      setFormError({
        title: 'Falta la edad',
        message: 'Debe escribir la edad del paciente.',
      });
      return;
    }

    if (!isValidAgeSpacing(formData.age)) {
      setFormError({
        title: 'Edad inválida',
        message: 'Separe el número de la unidad de edad. Ejemplo: 2 años.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingPatient
        ? `${API_URL}/pacientes/${editingPatient.id}`
        : `${API_URL}/pacientes`;

      const method = editingPatient ? 'PUT' : 'POST';

      const patientPayload = {
        ...formData,
        tutorId: isExistingTutorFlow ? selectedExistingTutorId : undefined,
        age: String(formData.age).trim(),
        breed:
          selectedBreedOption === 'Otra'
            ? customBreed.trim()
            : formData.breed,
      };

      // Validación previa: si la foto sigue siendo enorme, no intentes enviarla (evita el error "not valid json" por payload truncado en algunos teléfonos)
      const photoLen = String(patientPayload.photo || '').length;
      if (photoLen > 7 * 1024 * 1024) {
        throw new Error('La imagen es demasiado grande para enviar. Elige una foto más pequeña o sin foto.');
      }

      let bodyStr: string;
      try {
        bodyStr = JSON.stringify(patientPayload);
      } catch {
        throw new Error('No se pudo preparar los datos para enviar. Intenta sin foto o con una imagen más pequeña.');
      }

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: bodyStr,
      });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // Algunos teléfonos reciben HTML en 413; aquí evitamos el "not valid json"
        if (!response.ok) {
          throw new Error(rawText && rawText.length < 500 ? rawText : 'Error al guardar paciente. Intenta sin foto o con una imagen más pequeña.');
        }
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || data.Message || rawText || 'Error al guardar paciente');
      }

      setSuccessMessage(
        editingPatient
          ? 'Paciente actualizado correctamente'
          : 'Paciente agregado correctamente'
      );

      setShowSuccessModal(true);
      // Carga en segundo plano para no bloquear la respuesta en móvil (antes había await que duplicaba el tiempo)
      void loadPatients().catch(() => {});
    } catch (error) {
      console.error('Error al guardar paciente:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Revisa la consola o el backend.';

      setFormError({
        title: 'No se pudo guardar el paciente',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormError(null);
    setEditingPatient(null);
    setFormData({});
    setSelectedBreedOption('');
    setCustomBreed('');
    setBreedOptions([]);
    setTutorMode('new');
    setSelectedExistingTutorId('');
    setSelectedTutorSearch('');
    setShowTutorSuggestions(false);
    setHighlightedTutorId(null);
    setShowCloseConfirmation(false);
  };

  const getFormSignature = () => {
    const signature = {
      petName: formData.petName || '',
      species: formData.species || '',
      breed: formData.breed || '',
      age: formData.age || '',
      sex: formData.sex || '',
      reproductiveStatus: formData.reproductiveStatus || '',
      diet: formData.diet || '',
      color: formData.color || '',
      observations: formData.observations || '',
      tutorFirstName: formData.tutorFirstName || '',
      tutorMiddleName: formData.tutorMiddleName || '',
      tutorFirstSurname: formData.tutorFirstSurname || '',
      tutorSecondSurname: formData.tutorSecondSurname || '',
      tutorPhone: formData.tutorPhone || '',
      tutorEmail: formData.tutorEmail || '',
      tutorAddress: formData.tutorAddress || '',
      tutorId: formData.tutorId || '',
      photo: formData.photo || '',
    };

    return JSON.stringify(signature);
  };

  const isFormDirty = () => {
    if (!showModal && !isRegistrationPage) {
      return false;
    }

    const baseData = editingPatient
      ? {
          petName: editingPatient.petName || '',
          species: editingPatient.species || '',
          breed: editingPatient.breed || '',
          age: editingPatient.age || '',
          sex: editingPatient.sex || '',
          reproductiveStatus: editingPatient.reproductiveStatus || '',
          diet: editingPatient.diet || '',
          color: editingPatient.color || '',
          observations: editingPatient.observations || '',
          tutorFirstName: editingPatient.tutorFirstName || '',
          tutorMiddleName: editingPatient.tutorMiddleName || '',
          tutorFirstSurname: editingPatient.tutorFirstSurname || '',
          tutorSecondSurname: editingPatient.tutorSecondSurname || '',
          tutorPhone: editingPatient.tutorPhone || '',
          tutorEmail: editingPatient.tutorEmail || '',
          tutorAddress: editingPatient.tutorAddress || '',
          tutorId: editingPatient.tutorId || '',
          photo: editingPatient.photo || '',
        }
      : {
          petName: '',
          species: '',
          breed: '',
          age: '',
          sex: '',
          reproductiveStatus: '',
          diet: '',
          color: '',
          observations: '',
          tutorFirstName: '',
          tutorMiddleName: '',
          tutorFirstSurname: '',
          tutorSecondSurname: '',
          tutorPhone: '',
          tutorEmail: '',
          tutorAddress: '',
          tutorId: '',
          photo: '',
        };

    const currentSignature = getFormSignature();
    const baseSignature = JSON.stringify(baseData);

    const hasTutorSelection = tutorMode === 'existing' && !!selectedExistingTutorId;
    const hasSearchText = !!selectedTutorSearch.trim();

    return currentSignature !== baseSignature || hasTutorSelection || hasSearchText;
  };

  const handleCloseAttempt = () => {
    if (isFormDirty()) {
      setShowCloseConfirmation(true);
      return;
    }

    cancelForm();
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

  const openModal = async (patient?: PatientFormData) => {
    resetForm();

    const tutors = await loadExistingTutors();

    if (patient) {
      setEditingPatient(patient);
      setFormData(patient);
      setSelectedBreedOption(patient.breed || '');
      setCustomBreed('');

      const matchingTutor = tutors.find((tutor) => {
        const tutorName = `${tutor.primer_nombre || ''} ${tutor.primer_apellido || ''}`.trim();
        const patientName = `${patient.tutorFirstName || ''} ${patient.tutorFirstSurname || ''}`.trim();
        const tutorPhone = (tutor.telefono || '').replace(/\D/g, '');
        const patientPhone = (patient.tutorPhone || '').replace(/\D/g, '');

        return (
          (tutorPhone && patientPhone && tutorPhone === patientPhone) ||
          (tutorName && patientName && tutorName.toLowerCase() === patientName.toLowerCase())
        );
      });

      if (matchingTutor) {
        setTutorMode('existing');
        setSelectedExistingTutorId(String(matchingTutor.id));
        setSelectedTutorSearch(getTutorLabel(matchingTutor));
        setFormData({
          ...patient,
          tutorId: String(matchingTutor.id),
          tutorFirstName: matchingTutor.primer_nombre || patient.tutorFirstName || '',
          tutorMiddleName: matchingTutor.segundo_nombre || patient.tutorMiddleName || '',
          tutorFirstSurname: matchingTutor.primer_apellido || patient.tutorFirstSurname || '',
          tutorSecondSurname: matchingTutor.segundo_apellido || patient.tutorSecondSurname || '',
          tutorPhone: matchingTutor.telefono || patient.tutorPhone || '',
          tutorEmail: matchingTutor.correo || patient.tutorEmail || '',
          tutorAddress: matchingTutor.direccion || patient.tutorAddress || '',
        });
      }

      if (patient.species) {
        loadBreedsBySpecies(patient.species);
      }
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
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-foreground text-xl md:text-2xl font-bold mb-2">
            {isRegistrationPage ? 'Registrar paciente' : 'Pacientes'}
          </h1>
        </div>
        {!isRegistrationPage && permissions.canCreate && (
          <button
            type="button"
            onClick={() => openModal()}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-lg text-[#F7EFE6] shadow-lg transition-all duration-300 hover:bg-primary/90 hover:shadow-xl"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Agregar paciente
          </button>
        )}
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

          <div className="relative">
            <label className="block text-foreground mb-2 text-sm">
              Filtrar por especie
            </label>

            <button
              type="button"
              onClick={() => {
                setShowSpeciesMenu((current) => !current);
                setShowSortMenu(false);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary px-4 py-2.5 text-left text-foreground shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <span>{filterSpecies || 'Todas'}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {showSpeciesMenu && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-border bg-card shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFilterSpecies('');
                    setShowSpeciesMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-foreground transition-colors hover:bg-primary/10"
                >
                  <span>Todas</span>
                </button>

                {speciesOptions.map((species) => (
                  <button
                    key={species.especie_id}
                    type="button"
                    onClick={() => {
                      setFilterSpecies(species.nombre);
                      setShowSpeciesMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-foreground transition-colors hover:bg-primary/10"
                  >
                    <span>{species.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-foreground mb-2 text-sm">
              Ordenar por
            </label>

            <button
              type="button"
              onClick={() => {
                setShowSortMenu((current) => !current);
                setShowSpeciesMenu(false);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary px-4 py-2.5 text-left text-foreground shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <span>
                {sortOrder === 'pet-asc' && 'Mascota: A a Z'}
                {sortOrder === 'pet-desc' && 'Mascota: Z a A'}
                {sortOrder === 'tutor-asc' && 'Tutor: A a Z'}
                {sortOrder === 'tutor-desc' && 'Tutor: Z a A'}
                {sortOrder === 'registration-desc' && 'Registro: más reciente'}
                {sortOrder === 'registration-asc' && 'Registro: más antiguo'}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {showSortMenu && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-border bg-card shadow-xl">
                {[
                  ['pet-asc', 'Mascota: A a Z'],
                  ['pet-desc', 'Mascota: Z a A'],
                  ['tutor-asc', 'Tutor: A a Z'],
                  ['tutor-desc', 'Tutor: Z a A'],
                  ['registration-desc', 'Registro: más reciente'],
                  ['registration-asc', 'Registro: más antiguo'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSortOrder(value as PatientSortOrder);
                      setShowSortMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-foreground transition-colors hover:bg-primary/10"
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
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
                    className="w-full h-full object-cover"
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

                  {permissions.canEdit && <button
                    type="button"
                    onClick={() => openModal(patient)}
                    aria-label={`Editar a ${patient.petName || 'este paciente'}`}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-border px-2 py-2 text-xs font-semibold text-primary transition-colors hover:bg-secondary sm:gap-2 sm:text-sm"
                  >
                    <Edit className="h-4 w-4 shrink-0" />
                    Editar
                  </button>}

                  {permissions.canDelete && <button
                    type="button"
                    onClick={() => requestDelete(patient)}
                    aria-label={`Eliminar a ${patient.petName || 'este paciente'}`}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 sm:gap-2 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    Eliminar
                  </button>}
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
              <ThemedSelect
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </ThemedSelect>
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
          <div className={`patient-form-shell bg-card border border-border rounded-2xl p-4 md:p-6 w-full shadow-2xl ${isRegistrationPage ? 'max-w-4xl mx-auto' : 'max-w-3xl max-h-[90vh] overflow-y-auto'}`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-foreground text-xl">
                {editingPatient ? 'Editar paciente' : 'Datos del nuevo paciente'}
              </h2>

              <button
                type="button"
                onClick={handleCloseAttempt}
                aria-label="Cerrar formulario"
                className="patient-form-close flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="patient-form space-y-4">
              <div className="patient-form-section bg-muted border border-border rounded-xl p-4">
                <label className="block text-foreground mb-3 text-sm font-medium">
                  Foto de perfil del paciente
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    type="button"
                    onClick={handlePhotoAreaClick}
                    className="group relative w-28 h-28 shrink-0 rounded-2xl overflow-hidden border-4 border-border shadow-md flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
                    aria-label={formData.photo ? 'Cambiar foto del paciente' : 'Subir foto del paciente'}
                    title={formData.photo ? 'Cambiar foto (clic para seleccionar)' : 'Subir foto (clic para seleccionar)'}
                  >
                    {formData.photo ? (
                      <img
                        src={formData.photo}
                        alt="Foto del paciente"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-secondary flex items-center justify-center">
                        <Camera className="w-10 h-10 text-primary" />
                      </div>
                    )}
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/45 opacity-0 group-hover:opacity-100 transition-all duration-200 text-white text-xs font-medium">
                      <Upload className="w-5 h-5" />
                      {formData.photo ? 'Cambiar' : 'Subir'}
                    </span>
                  </button>

                  <input
                    ref={photoGalleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handlePhotoUpload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <input
                    ref={photoCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      handlePhotoUpload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />

                  <div className="flex-1">
                    <p className="text-muted-foreground text-sm mb-3">
                      Puedes tomar una foto desde la cámara o seleccionar una imagen del dispositivo. También puedes hacer clic sobre la imagen para seleccionar.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <label className="patient-form-primary flex items-center justify-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm">
                        <Camera className="w-4 h-4" />
                        Tomar foto

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            handlePhotoUpload(e.target.files?.[0]);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      <label className="patient-form-secondary flex items-center justify-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm">
                        <Upload className="w-4 h-4" />
                        Subir imagen

                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handlePhotoUpload(e.target.files?.[0]);
                            e.currentTarget.value = '';
                          }}
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
                <div className="md:col-span-2">
                  <label className="block text-foreground mb-2 text-sm font-medium">
                    Tipo de tutor
                  </label>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className={`patient-form-choice flex items-center gap-2 text-sm ${tutorMode === 'new' ? 'patient-form-choice-active' : ''}`}>
                      <input
                        type="radio"
                        name="tutorMode"
                        checked={tutorMode === 'new'}
                                        onChange={() => {
                          setTutorMode('new');
                          setSelectedExistingTutorId('');
                          setSelectedTutorSearch('');
                          setShowTutorSuggestions(false);
                          setFormData((current) => ({ ...current, tutorId: undefined }));
                        }}
                      />
                      Nuevo tutor
                    </label>

                    <label className={`patient-form-choice flex items-center gap-2 text-sm ${tutorMode === 'existing' ? 'patient-form-choice-active' : ''}`}>
                      <input
                        type="radio"
                        name="tutorMode"
                        checked={tutorMode === 'existing'}
                        onChange={() => {
                          setTutorMode('existing');
                          setSelectedExistingTutorId('');
                          setSelectedTutorSearch('');
                          setShowTutorSuggestions(false);
                          setFormData((current) => ({ ...current, tutorId: undefined }));
                        }}
                      />
                      Tutor existente
                    </label>
                  </div>
                </div>

                {tutorMode === 'existing' && (
                  <div className="md:col-span-2">
                    <label className="block text-foreground mb-2 text-sm font-medium">
                      Seleccionar tutor existente
                    </label>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />

                      <input
                        type="text"
                        value={selectedTutorSearch}
                        onChange={(e) => handleTutorSearchInput(e.target.value)}
                        onFocus={() => setShowTutorSuggestions(true)}
                        onBlur={() => {
                          window.setTimeout(() => setShowTutorSuggestions(false), 120);
                        }}
                        onKeyDown={handleTutorKeyNavigation}
                        placeholder="Buscar por nombre o teléfono"
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-primary/20 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground"
                        aria-expanded={showTutorSuggestions}
                        aria-autocomplete="list"
                      />
                    </div>

                    {showTutorSuggestions && (
                      <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                        {filteredTutorSuggestions.length > 0 ? (
                          filteredTutorSuggestions.map((tutor) => {
                            const tutorId = String(tutor.id);
                            const isHighlighted = highlightedTutorId === tutorId;

                            return (
                              <button
                                type="button"
                                key={tutor.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleTutorSelection(tutorId);
                                }}
                                onMouseEnter={() => setHighlightedTutorId(tutorId)}
                                className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-foreground transition-colors last:border-b-0 ${
                                  isHighlighted ? 'bg-primary/10' : 'hover:bg-primary/5'
                                }`}
                              >
                                <span className="truncate font-medium">
                                  {tutor.nombre_completo || `${tutor.primer_nombre || ''} ${tutor.primer_apellido || ''}`.trim()}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {tutor.telefono || 'Sin teléfono'}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-3 text-sm text-muted-foreground">
                            No se encontraron tutores con ese nombre o teléfono.
                          </div>
                        )}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-muted-foreground">
                      Escribe para buscar un tutor registrado y selecciona el resultado.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Nombre de la mascota
                  </label>

                  <input
                    type="text"
                    value={formData.petName || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, petName: sanitizePetName(e.target.value) })
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

                  <ThemedSelect
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
                  </ThemedSelect>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Raza
                  </label>

                  <ThemedSelect
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
                  </ThemedSelect>

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

                  <ThemedSelect
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
                  </ThemedSelect>
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Estado reproductivo
                  </label>

                  <ThemedSelect
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
                  </ThemedSelect>
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

                {tutorMode !== 'existing' && (
                  <>
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
                        pattern="[0-9]{8,12}"
                        minLength={8}
                        maxLength={12}
                        title="Entre 8 y 12 dígitos"
                      />
                    </div>

                    <div className="relative">
                      <label className="block text-foreground mb-2 text-sm">
                        Correo del tutor
                      </label>

                      <input
                        type="email"
                        aria-describedby={isTutorEmailFocused && !isValidEmail(formData.tutorEmail) ? 'tutor-email-help' : undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setIsTutorEmailFocused(false);
                        }}
                        onFocus={() => setIsTutorEmailFocused(true)}
                        onBlur={() => setIsTutorEmailFocused(false)}
                        aria-invalid={Boolean(formData.tutorEmail && !isValidEmail(formData.tutorEmail))}
                        value={formData.tutorEmail || ''}
                        onChange={(e) =>
                          {
                            setIsTutorEmailFocused(true);
                            setFormData({ ...formData, tutorEmail: e.target.value });
                          }
                        }
                        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                        required
                      />
                      {isTutorEmailFocused && !isValidEmail(formData.tutorEmail) && (
                        <div
                          id="tutor-email-help"
                          role="tooltip"
                          aria-live="polite"
                          className="absolute left-4 top-full z-50 mt-2 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded border border-border bg-popover px-2 py-2 text-xs text-popover-foreground shadow-md pointer-events-none"
                        >
                          <span aria-hidden="true" className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-border bg-popover" />
                          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-orange-600 text-sm font-bold text-white">!</span>
                          <span>Usa el formato nombre@dominio.com.</span>
                        </div>
                      )}
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
                  </>
                )}
              </div>

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Observaciones de la mascota
                </label>

                <textarea
                  value={formData.observations || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      observations: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  enterKeyHint="done"
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  rows={3}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="patient-form-primary w-full rounded-lg px-5 py-2.5 transition-colors sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Guardando...' : editingPatient ? 'Actualizar' : 'Crear'}
                </button>

                <button
                  type="button"
                  onClick={cancelForm}
                  className="patient-form-secondary w-full rounded-lg px-5 py-2.5 transition-colors sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {formError && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[95]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3 text-red-700">
                <AlertTriangle className="h-7 w-7" />
              </div>
            </div>

            <h3 className="text-foreground text-xl font-semibold mb-2">
              {formError.title}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">{formError.message}</p>

            <button
              type="button"
              onClick={() => setFormError(null)}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-[#F7EFE6] transition-colors hover:bg-primary/90"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {showCloseConfirmation && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-warning/10 p-3 text-warning">
                <AlertTriangle className="h-7 w-7" />
              </div>
            </div>

            <h3 className="text-foreground text-xl font-semibold mb-2">
              ¿Está seguro de cerrar el formulario?
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              Los datos ingresados se perderán si sales sin guardar.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
              <button
                type="button"
                onClick={() => setShowCloseConfirmation(false)}
                className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-border"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirmation(false);
                  cancelForm();
                }}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-[#F7EFE6] transition-colors hover:bg-primary/90"
              >
                Salir
              </button>
            </div>
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
