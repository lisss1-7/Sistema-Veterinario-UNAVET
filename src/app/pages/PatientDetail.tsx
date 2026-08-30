import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useParams, Link } from 'react-router';
import {
  ArrowLeft,
  Plus,
  Download,
  Camera,
  Upload,
  CheckCircle,
  Trash2,
  AlertTriangle,
  X,
  Edit,
  FileText,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type {
  Patient,
  ClinicalRecord,
  Vaccination,
  TreatmentService,
} from '../utils/types';
import { getTodayLocal, isNonNegativeNumber } from '../utils/formValidation';
import { drawUnavetPdfHeader, getUnavetLogoBase64 } from '../utils/pdfBranding';
import ThemedSelect from '../components/ThemedSelect';

type PatientWithPhoto = Patient & {
  photo?: string;
};

type ClinicalRecordExtended = ClinicalRecord & {
  observations?: string;
  sourceType?: string;
  appointmentId?: string;
  clinicalStatus?: 'Pendiente' | 'Completado';
};

type VaccinationExtended = Vaccination & {
  notes?: string;
  lot?: string;
  interval?: string | number;
  intervalUnit?: string;
  appliedDoses?: number;
  totalDoses?: number;
};

type TreatmentServiceExtended = TreatmentService & {
  observations?: string;
  attachmentPhoto?: string;
};

type DeleteTarget = {
  id: string;
  type: 'clinical' | 'vaccination' | 'treatment';
  title: string;
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

type SelectOption = string | {
  value: string;
  label: string;
};

const MODAL_BACKDROP_CLASS =
  'modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50';

const MODAL_CARD_CLASS =
  'bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl';

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();

  const [patient, setPatient] = useState<PatientWithPhoto | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecordExtended[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationExtended[]>([]);
  const [treatments, setTreatments] = useState<TreatmentServiceExtended[]>([]);

  const [showModal, setShowModal] = useState<
    'clinical' | 'vaccination' | 'treatment' | null
  >(null);

  const [editingClinicalRecord, setEditingClinicalRecord] =
    useState<ClinicalRecordExtended | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [viewTarget, setViewTarget] = useState<{
    type: 'clinical' | 'vaccination' | 'treatment';
    item: ClinicalRecordExtended | VaccinationExtended | TreatmentServiceExtended;
  } | null>(null);

  const [formData, setFormData] = useState<any>({});

  const [vaccineOptions, setVaccineOptions] = useState<string[]>([]);
  const [labTestOptions, setLabTestOptions] = useState<string[]>([]);
  const [consultationTypeOptions, setConsultationTypeOptions] = useState<string[]>([]);
  const [treatmentTypeOptions, setTreatmentTypeOptions] = useState<string[]>([]);
  const [treatmentStatusOptions, setTreatmentStatusOptions] = useState<string[]>([]);
  const [examStatusOptions, setExamStatusOptions] = useState<string[]>([]);
  const [intervalUnitOptions, setIntervalUnitOptions] = useState<string[]>([]);
  const [veterinarianOptions, setVeterinarianOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    loadPatientData();
    loadCatalogs();
  }, [id]);

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
      fetchCatalogSafely('vacunas', setVaccineOptions),
      fetchCatalogSafely('pruebas-laboratorio', setLabTestOptions),
      fetchCatalogSafely('tipos-consulta', setConsultationTypeOptions),
      fetchCatalogSafely('tipos-tratamiento', setTreatmentTypeOptions),
      fetchCatalogSafely('estados-tratamiento', setTreatmentStatusOptions),
      fetchCatalogSafely('estados-examen-fisico', setExamStatusOptions),
      fetchCatalogSafely('unidades-intervalo', setIntervalUnitOptions),
      fetch(`${API_URL}/catalogos/veterinarios`, {
        method: 'GET',
        headers: getAuthHeaders(),
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.message || 'Error al cargar veterinarios');
          }
          setVeterinarianOptions(
            data.map((item: CatalogItem) => ({
              value: String(item.veterinario_id || item.id),
              label: item.nombre,
            }))
          );
        })
        .catch((error) => {
          console.error('Error al cargar veterinarios:', error);
          setVeterinarianOptions([]);
        }),
    ]);
  };

  const loadClinicalRecords = async () => {
    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/historial-clinico/paciente/${id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar historial clínico');
      }

      setClinicalRecords(data);
    } catch (error) {
      console.error('Error al cargar historial clínico:', error);
      setClinicalRecords([]);
    }
  };

  const loadVaccinations = async () => {
    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/vacunaciones/paciente/${id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar vacunaciones');
      }

      setVaccinations(data);
    } catch (error) {
      console.error('Error al cargar vacunaciones:', error);
      setVaccinations([]);
    }
  };

  const loadTreatments = async () => {
    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/tratamientos/paciente/${id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar tratamientos y servicios');
      }

      setTreatments(data);
    } catch (error) {
      console.error('Error al cargar tratamientos y servicios:', error);
      setTreatments([]);
    }
  };

  const loadPatientData = async () => {
    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/pacientes/${id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar paciente');
      }

      setPatient(data);
    } catch (error) {
      console.error('Error al cargar paciente:', error);
      setPatient(null);
    }

    await loadClinicalRecords();
    await loadVaccinations();
    await loadTreatments();
  };

  const openNewClinicalModal = () => {
    setEditingClinicalRecord(null);
    setFormData({});
    setShowModal('clinical');
  };

  const openEditClinicalModal = (record: ClinicalRecordExtended) => {
    setEditingClinicalRecord(record);
    setFormData({
      consultationType: record.consultationType || '',
      veterinarianId: record.veterinarianId || '',
      reason: record.reason || '',
      previousSurgeries: record.previousSurgeries || '',
      visibleMasses: record.visibleMasses || '',
      examSkin: record.examSkin || '',
      examEyes: record.examEyes || '',
      examRespiratory: record.examRespiratory || '',
      examEars: record.examEars || '',
      examNervous: record.examNervous || '',
      examGenitourinary: record.examGenitourinary || '',
      examNodules: record.examNodules || '',
      examPressure: record.examPressure || '',
      diagnosis: record.diagnosis || '',
      treatment: record.treatment || '',
      observations: record.observations || '',
      date: record.date || new Date().toISOString().split('T')[0],
      sourceType: record.sourceType,
      appointmentId: record.appointmentId,
      clinicalStatus: record.clinicalStatus || 'Pendiente',
    });
    setShowModal('clinical');
  };

  const closeFormModal = () => {
    setShowModal(null);
    setFormData({});
    setEditingClinicalRecord(null);
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    closeFormModal();
  };

  const handleAttachmentPhoto = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Debe seleccionar una imagen válida');
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setFormData({
        ...formData,
        attachmentPhoto: reader.result as string,
      });
    };

    reader.readAsDataURL(file);
  };

  const removeAttachmentPhoto = () => {
    setFormData({
      ...formData,
      attachmentPhoto: '',
    });
  };

  const handleClinicalSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!id) return;

    try {
      const url = editingClinicalRecord
        ? `${API_URL}/historial-clinico/${editingClinicalRecord.id}`
        : `${API_URL}/historial-clinico`;

      const method = editingClinicalRecord ? 'PUT' : 'POST';

      const body = {
        ...formData,
        patientId: id,
        clinicalStatus: 'Completado',
      };

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al guardar historial clínico');
      }

      await loadClinicalRecords();

      setSuccessMessage(
        editingClinicalRecord?.sourceType === 'appointment'
          ? 'Consulta completada correctamente'
          : editingClinicalRecord
          ? 'Registro clínico actualizado correctamente'
          : 'Registro clínico agregado correctamente'
      );

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar historial clínico:', error);
      alert('No se pudo guardar el registro clínico. Revisa el backend o la consola.');
    }
  };

  const handleVaccinationSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!id) return;

    const totalDoses = Number(formData.totalDoses);
    const appliedDoses = Number(formData.appliedDoses);
    const interval = Number(formData.interval);
    if (
      !Number.isInteger(totalDoses) || totalDoses < 1 ||
      !Number.isInteger(appliedDoses) || appliedDoses < 1 ||
      appliedDoses > totalDoses ||
      !isNonNegativeNumber(interval)
    ) {
      alert('Revise las dosis: el total debe ser mayor a cero y las aplicadas no pueden superar el total.');
      return;
    }
    if (!formData.applicationDate || formData.applicationDate > getTodayLocal()) {
      alert('La fecha de aplicación no puede estar en el futuro.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/vacunaciones`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...formData,
          patientId: id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al registrar vacuna');
      }

      await loadVaccinations();

      setSuccessMessage('Vacuna registrada correctamente');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al registrar vacuna:', error);
      alert('No se pudo registrar la vacuna. Revisa el backend o la consola.');
    }
  };

  const handleTreatmentSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/tratamientos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...formData,
          patientId: id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al agregar tratamiento o servicio');
      }

      await loadTreatments();

      setSuccessMessage('Tratamiento o servicio agregado correctamente');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al agregar tratamiento o servicio:', error);
      alert('No se pudo agregar el tratamiento o servicio. Revisa el backend o la consola.');
    }
  };

  const openDeleteModal = (
    deleteId: string,
    type: 'clinical' | 'vaccination' | 'treatment',
    title: string
  ) => {
    setDeleteTarget({
      id: deleteId,
      type,
      title,
    });

    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const openViewModal = (
    type: 'clinical' | 'vaccination' | 'treatment',
    item: ClinicalRecordExtended | VaccinationExtended | TreatmentServiceExtended
  ) => {
    setViewTarget({ type, item });
  };

  const closeViewModal = () => {
    setViewTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'clinical') {
      try {
        const response = await fetch(`${API_URL}/historial-clinico/${deleteTarget.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Error al eliminar registro clínico');
        }

        await loadClinicalRecords();
      } catch (error) {
        console.error('Error al eliminar registro clínico:', error);
        alert('No se pudo eliminar el registro clínico.');
        return;
      }
    }

    if (deleteTarget.type === 'vaccination') {
      try {
        const response = await fetch(`${API_URL}/vacunaciones/${deleteTarget.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Error al eliminar vacuna');
        }

        await loadVaccinations();
      } catch (error) {
        console.error('Error al eliminar vacuna:', error);
        alert('No se pudo eliminar la vacuna.');
        return;
      }
    }

    if (deleteTarget.type === 'treatment') {
      try {
        const response = await fetch(`${API_URL}/tratamientos/${deleteTarget.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Error al eliminar tratamiento o servicio');
        }

        await loadTreatments();
      } catch (error) {
        console.error('Error al eliminar tratamiento o servicio:', error);
        alert('No se pudo eliminar el tratamiento o servicio.');
        return;
      }
    }

    setShowDeleteModal(false);
    setDeleteTarget(null);
    setShowDeleteSuccessModal(true);
  };

  const closeDeleteSuccessModal = () => {
    setShowDeleteSuccessModal(false);
  };

  const formatPdfName = (prefix: string, petName?: string) => {
    const cleanName = (petName || 'Paciente')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const formattedName = cleanName
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return `${prefix} ${formattedName}.pdf`;
  };

  const createPdfBase = async (title: string) => {
    const doc = new jsPDF();
    const logoBase64 = await getUnavetLogoBase64();
    const pageWidth = doc.internal.pageSize.getWidth();
 
    drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');

    doc.setTextColor('#2F2924');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, 16, 46);

    if (patient?.photo) {
      try {
        doc.addImage(patient.photo, 'JPEG', 160, 38, 30, 30);
      } catch {
        try {
          doc.addImage(patient.photo, 'PNG', 160, 38, 30, 30);
        } catch {
          // Si la imagen no se puede cargar, el PDF se genera sin imagen.
        }
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    doc.text(`Paciente: ${patient?.petName || 'N/A'}`, 16, 60);
    doc.text(`Especie: ${patient?.species || 'N/A'}`, 16, 67);
    doc.text(`Raza: ${patient?.breed || 'N/A'}`, 16, 74);
    doc.text(`Tutor: ${patient?.tutorName || 'N/A'}`, 95, 60);
    doc.text(`Teléfono: ${patient?.tutorPhone || 'N/A'}`, 95, 67);

    doc.setDrawColor('#D8D2C8');
    doc.line(16, 82, pageWidth - 16, 82);

    return { doc, logoBase64 };
  };

  const addPdfFooter = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const generatedAt = new Date().toLocaleString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc.setDrawColor('#D8D2C8');
    doc.line(16, pageHeight - 16, pageWidth - 16, pageHeight - 16);

    doc.setTextColor('#6B6255');
    doc.setFontSize(8);
    doc.text(
      'UNAVET - Documento generado por el sistema clínico',
      16,
      pageHeight - 9
    );
    doc.text(`Emitido: ${generatedAt}`, pageWidth - 16, pageHeight - 9, {
      align: 'right',
    });
  };

  const downloadClinicalPdf = async (record: ClinicalRecordExtended) => {
    const { doc } = await createPdfBase('Registro Clínico');

    let y = 96;

    doc.setTextColor('#2F2924');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Datos del registro', 16, y);

    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Fecha: ${record.date}`, 16, y);
    y += 7;
    doc.text(`Tipo de consulta: ${record.consultationType}`, 16, y);
    y += 7;
    doc.text(`Médico veterinario: ${record.veterinarian}`, 16, y);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.text('Motivo de consulta', 16, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(record.reason || 'N/A', 178), 16, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.text('Diagnóstico', 16, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(record.diagnosis || 'N/A', 178), 16, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.text('Tratamiento indicado', 16, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(record.treatment || 'N/A', 178), 16, y);

    addPdfFooter(doc);
    doc.save(formatPdfName('Registro Clinico', patient?.petName));
  };

  const downloadSingleVaccinationPdf = async (vacc: VaccinationExtended) => {
    const { doc } = await createPdfBase('Vacuna');

    let y = 96;

    doc.setTextColor('#2F2924');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(vacc.vaccine || 'Vacuna', 16, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Fecha de aplicación: ${vacc.applicationDate || 'N/A'}`, 16, y);
    y += 8;
    doc.text(`Veterinario: ${vacc.veterinarian || 'N/A'}`, 16, y);
    y += 8;
    doc.text(`Estado: ${vacc.status || 'N/A'}`, 16, y);
    y += 8;
    doc.text(`Dosis aplicada: ${vacc.appliedDoses ?? 0} / ${vacc.totalDoses ?? 0}`, 16, y);
    y += 8;
    doc.text(`Próxima dosis: ${vacc.nextDose || 'N/A'}`, 16, y);
    y += 8;
    doc.text(`Intervalo: ${vacc.interval || 'N/A'} ${vacc.intervalUnit || ''}`.trim(), 16, y);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.text('Notas', 16, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(vacc.notes || 'Sin notas registradas.', 178), 16, y);

    addPdfFooter(doc);
    doc.save(formatPdfName(vacc.vaccine || 'Vacuna', patient?.petName));
  };

  const downloadClinicalHistoryPdf = async () => {
    const { doc, logoBase64 } = await createPdfBase('Historial Clínico Completo');

    let y = 96;

    doc.setFillColor('#6B6258');
    doc.rect(16, y, 178, 9, 'F');

    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text('Fecha / Tipo', 18, y + 6);
    doc.text('Diagnóstico', 98, y + 6);
    doc.text('Tratamiento', 152, y + 6);

    y += 9;

    if (clinicalRecords.length === 0) {
      doc.setTextColor('#6B5B4D');
      doc.setFont('helvetica', 'normal');
      doc.text('No hay registros clínicos.', 16, y + 8);
      addPdfFooter(doc);
      doc.save(formatPdfName('Historial Clinico Completo', patient?.petName));
      return;
    }

    clinicalRecords.forEach((record) => {
      if (y > 245) {
        addPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');
        y = 43;

        doc.setFillColor('#6B6258');
        doc.rect(16, y, 178, 9, 'F');
        doc.setTextColor('#FFFFFF');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Fecha / Tipo', 18, y + 6);
        doc.text('Diagnóstico', 98, y + 6);
        doc.text('Tratamiento', 152, y + 6);
        y += 9;
      }

      doc.setDrawColor('#D8D2C8');
      doc.rect(16, y, 178, 22);

      doc.setTextColor('#2F2924');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const titleLine = doc.splitTextToSize(`${record.date || 'N/A'} • ${record.consultationType || 'Consulta'}`, 72);
      doc.text(titleLine, 18, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const diagnosis = doc.splitTextToSize(`Diagnóstico: ${record.diagnosis || 'N/A'}`, 48);
      const treatment = doc.splitTextToSize(`Tratamiento: ${record.treatment || 'N/A'}`, 48);
      doc.text(diagnosis, 98, y + 6);
      doc.text(treatment, 152, y + 6);

      y += 22;
    });

    addPdfFooter(doc);
    doc.save(formatPdfName('Historial Clinico Completo', patient?.petName));
  };

  const downloadVaccinationPdf = async () => {
    const { doc, logoBase64 } = await createPdfBase('Esquema de Vacunación');

    let y = 96;

    doc.setFillColor('#6B6258');
    doc.rect(16, y, 178, 9, 'F');

    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text('Vacuna', 18, y + 6);
    doc.text('Aplicación', 72, y + 6);
    doc.text('Dosis', 112, y + 6);
    doc.text('Próxima', 140, y + 6);
    doc.text('Estado', 170, y + 6);

    y += 9;

    vaccinations.forEach((vacc) => {
      if (y > 260) {
        addPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');
        y = 43;
      }

      doc.setTextColor('#2F2924');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);

      doc.setDrawColor('#D8D2C8');
      doc.rect(16, y, 178, 11);

      doc.text(doc.splitTextToSize(vacc.vaccine || 'N/A', 50), 18, y + 7);
      doc.text(vacc.applicationDate || 'N/A', 72, y + 7);
      doc.text(`${vacc.appliedDoses || 0}/${vacc.totalDoses || 0}`, 112, y + 7);
      doc.text(vacc.nextDose || 'N/A', 140, y + 7);
      doc.text(vacc.status || 'N/A', 170, y + 7);

      y += 11;
    });

    if (vaccinations.length === 0) {
      doc.setTextColor('#6B5B4D');
      doc.text('No hay vacunas registradas.', 16, y);
    }

    addPdfFooter(doc);
    doc.save(formatPdfName('Esquema Vacunacion', patient?.petName));
  };

  const downloadTreatmentPdf = async (treat: TreatmentServiceExtended) => {
    const title =
      treat.type === 'Servicio de laboratorio'
        ? 'Servicio de Laboratorio'
        : 'Tratamiento o Servicio';

    const { doc, logoBase64 } = await createPdfBase(title);

    let y = 96;

    doc.setTextColor('#2F2924');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(treat.name || 'Registro', 16, y);

    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    doc.text(`Tipo: ${treat.type || 'N/A'}`, 16, y);
    y += 7;
    doc.text(`Categoría: ${treat.category || 'N/A'}`, 16, y);
    y += 7;
    doc.text(`Estado: ${treat.status || 'N/A'}`, 16, y);
    y += 7;
    doc.text(`Médico veterinario: ${treat.veterinarian || 'N/A'}`, 16, y);
    y += 7;
    doc.text(`Fecha de registro: ${treat.requestDate || 'N/A'}`, 16, y);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.text('Diagnóstico o motivo', 16, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(treat.diagnosisOrReason || 'N/A', 178), 16, y);
    y += 22;

    if (treat.observations) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones', 16, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(treat.observations, 178), 16, y);
      y += 22;
    }

    if (treat.attachmentPhoto) {
      if (y > 190) {
        addPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');
        y = 43;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Fotografía adjunta', 16, y);
      y += 7;

      try {
        doc.addImage(treat.attachmentPhoto, 'JPEG', 16, y, 80, 60);
      } catch {
        try {
          doc.addImage(treat.attachmentPhoto, 'PNG', 16, y, 80, 60);
        } catch {
          doc.setFont('helvetica', 'normal');
          doc.text('No fue posible cargar la fotografía adjunta.', 16, y);
        }
      }
    }

    addPdfFooter(doc);
    doc.save(formatPdfName('Servicio', patient?.petName));
  };

  const downloadAllTreatmentsPdf = async () => {
    const { doc, logoBase64 } = await createPdfBase(
      'Tratamientos y Servicios'
    );
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 32;
    const bottomLimit = pageHeight - 24;
    let y = 94;
    let currentRecordLabel = '';

    const addContinuationPage = () => {
      addPdfFooter(doc);
      doc.addPage();
      drawUnavetPdfHeader(
        doc,
        logoBase64,
        'Sistema de Gestión Veterinaria'
      );

      doc.setTextColor('#2F2924');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Tratamientos y Servicios (continuación)', 16, 47);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Paciente: ${patient?.petName || 'N/A'}`, 16, 55);

      if (currentRecordLabel) {
        doc.setFont('helvetica', 'bold');
        doc.text(`${currentRecordLabel} (continuación)`, 16, 63);
      }

      doc.setDrawColor('#D8D2C8');
      doc.line(
        16,
        currentRecordLabel ? 69 : 62,
        pageWidth - 16,
        currentRecordLabel ? 69 : 62
      );
      y = currentRecordLabel ? 77 : 70;
    };

    const ensureSpace = (requiredHeight: number) => {
      if (y + requiredHeight > bottomLimit) {
        addContinuationPage();
      }
    };

    const addTextField = (
      label: string,
      value?: string | number | null
    ) => {
      const normalizedValue = String(value ?? '').trim() || 'N/A';
      let remainingLines = [
        ...(doc.splitTextToSize(normalizedValue, contentWidth - 4) as string[]),
      ];
      let continued = false;

      while (remainingLines.length > 0) {
        ensureSpace(12);

        doc.setTextColor('#6B6255');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(continued ? `${label} (continuación)` : label, 18, y);
        y += 5;

        const availableLines = Math.max(
          1,
          Math.floor((bottomLimit - y) / 4.5)
        );
        const pageLines = remainingLines.slice(0, availableLines);
        remainingLines = remainingLines.slice(availableLines);

        doc.setTextColor('#2F2924');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(pageLines, 18, y);
        y += pageLines.length * 4.5 + 4;

        if (remainingLines.length > 0) {
          addContinuationPage();
          continued = true;
        }
      }
    };

    doc.setTextColor('#6B6255');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total de registros: ${treatments.length}`, 16, y);
    y += 10;

    if (treatments.length === 0) {
      doc.setTextColor('#6B5B4D');
      doc.text(
        'No hay tratamientos ni servicios registrados para este paciente.',
        16,
        y
      );
    }

    treatments.forEach((treat, index) => {
      ensureSpace(48);
      currentRecordLabel = `Registro ${index + 1} de ${treatments.length}`;

      doc.setFillColor('#8B6F47');
      doc.roundedRect(16, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor('#FFFFFF');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(
        `Registro ${index + 1} de ${treatments.length}`,
        19,
        y + 6.5
      );
      y += 16;

      addTextField('Nombre', treat.name);
      addTextField('Tipo', treat.type);
      addTextField('Categoría', treat.category);
      addTextField('Estado', treat.status);
      addTextField('Fecha de registro', treat.requestDate);
      addTextField('Médico veterinario', treat.veterinarian);
      addTextField('Registrado por', treat.createdByName || 'Sistema');
      addTextField('Diagnóstico o motivo', treat.diagnosisOrReason);

      if (treat.dose) addTextField('Dosis', treat.dose);
      if (treat.frequency) addTextField('Frecuencia', treat.frequency);
      if (treat.duration) addTextField('Duración', treat.duration);
      if (treat.startDate) addTextField('Fecha de inicio', treat.startDate);
      if (treat.endDate) addTextField('Fecha de finalización', treat.endDate);
      if (treat.resultStatus) {
        addTextField('Estado del resultado', treat.resultStatus);
      }
      if (treat.resultDate) {
        addTextField('Fecha del resultado', treat.resultDate);
      }
      if (treat.result) addTextField('Resultado', treat.result);

      addTextField(
        'Observaciones',
        treat.observations || 'Sin observaciones registradas.'
      );

      if (treat.attachmentPhoto) {
        ensureSpace(70);

        doc.setTextColor('#6B6255');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Fotografía adjunta', 18, y);
        y += 5;

        try {
          doc.addImage(treat.attachmentPhoto, 'JPEG', 18, y, 80, 60);
          y += 65;
        } catch {
          try {
            doc.addImage(treat.attachmentPhoto, 'PNG', 18, y, 80, 60);
            y += 65;
          } catch {
            doc.setTextColor('#2F2924');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('No fue posible cargar la fotografía adjunta.', 18, y);
            y += 9;
          }
        }
      }

      y += 4;
      currentRecordLabel = '';
    });

    addPdfFooter(doc);

    const totalPages = doc.getNumberOfPages();

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setTextColor('#6B6255');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Página ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 9, {
        align: 'center',
      });
    }

    doc.save(
      formatPdfName('Tratamientos y Servicios', patient?.petName)
    );
  };

  if (!patient) {
    return (
      <div className="p-4 md:p-8">
        <Link
          to="/patients"
          className="inline-flex items-center gap-2 text-base font-bold text-primary hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          Volver a pacientes
        </Link>

        <p className="text-foreground">Paciente no encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <Link
        to="/patients"
        className="inline-flex items-center gap-2 text-base font-bold text-primary hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        Volver a pacientes
      </Link>

      <div className="bg-card rounded-2xl p-5 md:p-6 shadow-lg mb-6 border border-border">
        <div className="flex flex-col md:flex-row gap-5 md:items-center">
          <div className="w-32 h-32 rounded-2xl overflow-hidden bg-secondary border-4 border-border shadow-md flex items-center justify-center">
            {patient.photo ? (
              <img
                src={patient.photo}
                alt={`Foto de ${patient.petName}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <Camera className="h-12 w-12 text-muted-foreground" strokeWidth={1.6} />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2 break-words">
                {patient.petName}
              </h1>

              <Link
                to={`/prescriptions?patientId=${encodeURIComponent(id || '')}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                Generar receta
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Especie:</span>
                <p className="text-foreground font-medium">{patient.species || 'N/A'}</p>
              </div>

              <div>
                <span className="text-muted-foreground">Raza:</span>
                <p className="text-foreground font-medium">{patient.breed || 'N/A'}</p>
              </div>

              <div>
                <span className="text-muted-foreground">Edad:</span>
                <p className="text-foreground font-medium">
                  {patient.age || 'No registrada'}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground">Sexo:</span>
                <p className="text-foreground font-medium">{patient.sex || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
        <div className="flex overflow-x-auto border-b border-border">
          {[
            ['general', 'Datos generales'],
            ['clinical', 'Historial clínico'],
            ['vaccination', 'Vacunación'],
            ['treatments', 'Tratamientos y servicios'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-primary text-[#F7EFE6]'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoItem label="Nombre del tutor" value={patient.tutorName} />
                <InfoItem label="Teléfono del tutor" value={patient.tutorPhone} />
                <InfoItem label="Correo del tutor" value={patient.tutorEmail} />
                <InfoItem label="Dirección del tutor" value={patient.tutorAddress} />
                <InfoItem
                  label="Edad"
                  value={String(patient.age || 'No registrada')}
                />
                <InfoItem label="Sexo" value={patient.sex} />
                <InfoItem label="Estado reproductivo" value={patient.reproductiveStatus || 'No registrado'} />
                <InfoItem label="Color" value={patient.color} />
                <InfoItem label="Alimentación" value={patient.diet || 'No registrada'} />
                <InfoItem label="Última visita" value={patient.lastVisit} />
              </div>

              <InfoItem
                label="Observaciones"
                value={patient.observations || 'Sin observaciones'}
              />
            </div>
          )}

          {activeTab === 'clinical' && (
            <section>
              <SectionHeader
                title="Historial clínico"
                buttonText="Nuevo registro"
                onAdd={openNewClinicalModal}
                extraButton={
                  <button
                    onClick={downloadClinicalHistoryPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar historial completo
                  </button>
                }
              />

              <div className="space-y-4">
                {clinicalRecords.map((record) => (
                  <div
                    key={record.id}
                    className="p-4 bg-muted rounded-xl border border-border"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-3 mb-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="text-primary font-medium">
                            {record.date}
                          </p>

                          {record.sourceType === 'appointment' && (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary">
                              Desde cita
                            </span>
                          )}

                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              record.clinicalStatus === 'Completado'
                                ? 'border border-primary/20 bg-primary/10 text-primary'
                                : 'border border-accent/30 bg-accent/10 text-foreground'
                            }`}
                          >
                            {record.clinicalStatus === 'Completado'
                              ? 'Evaluación completada'
                              : 'Pendiente de evaluación'}
                          </span>
                        </div>

                        <p className="text-foreground text-sm">
                          {record.consultationType}
                        </p>

                        <p className="text-muted-foreground text-sm">
                          {record.veterinarian
                            ? `Dr. ${record.veterinarian}`
                            : 'Médico pendiente de asignar'}
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                          Registrado por: {record.createdByName || 'Sistema'}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => openViewModal('clinical', record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Ver
                        </button>

                        <button
                          onClick={() => openEditClinicalModal(record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-muted hover:bg-border text-foreground rounded-lg text-sm transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          {record.sourceType === 'appointment' &&
                          record.clinicalStatus !== 'Completado'
                            ? 'Completar consulta'
                            : 'Editar'}
                        </button>

                        <button
                          onClick={() => downloadClinicalPdf(record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg text-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        <button
                          onClick={() =>
                            openDeleteModal(
                              record.id,
                              'clinical',
                              `registro clínico del ${record.date}`
                            )
                          }
                          className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <RecordLine label="Motivo" value={record.reason} />
                    {record.previousSurgeries && <RecordLine label="Cirugías previas" value={record.previousSurgeries} />}
                    {record.visibleMasses && <RecordLine label="Masas visibles" value={record.visibleMasses} />}
                    <RecordLine label="Diagnóstico" value={record.diagnosis} />
                    <RecordLine label="Tratamiento" value={record.treatment} />

                    {(record.examSkin || record.examEyes || record.examRespiratory || record.examEars || record.examNervous || record.examGenitourinary || record.examNodules || record.examPressure) && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 p-3 bg-white rounded-lg border border-border text-xs">
                        {record.examSkin && <div><span className="text-muted-foreground">Piel/Mucosas:</span> {record.examSkin}</div>}
                        {record.examEyes && <div><span className="text-muted-foreground">Ojos:</span> {record.examEyes}</div>}
                        {record.examRespiratory && <div><span className="text-muted-foreground">Respiratorio:</span> {record.examRespiratory}</div>}
                        {record.examEars && <div><span className="text-muted-foreground">Oídos:</span> {record.examEars}</div>}
                        {record.examNervous && <div><span className="text-muted-foreground">Nervioso:</span> {record.examNervous}</div>}
                        {record.examGenitourinary && <div><span className="text-muted-foreground">Genito/Urinario:</span> {record.examGenitourinary}</div>}
                        {record.examNodules && <div><span className="text-muted-foreground">Nódulos:</span> {record.examNodules}</div>}
                        {record.examPressure && <div><span className="text-muted-foreground">Presión:</span> {record.examPressure}</div>}
                      </div>
                    )}

                    {record.observations && (
                      <RecordLine label="Observaciones" value={record.observations} />
                    )}
                  </div>
                ))}

                {clinicalRecords.length === 0 && (
                  <EmptyText text="No hay registros clínicos" />
                )}
              </div>
            </section>
          )}

          {activeTab === 'vaccination' && (
            <section>
              <SectionHeader
                title="Vacunación"
                buttonText="Registrar vacuna"
                onAdd={() => {
                  setFormData({
                    applicationDate: getTodayLocal(),
                    totalDoses: 1,
                    appliedDoses: 1,
                    interval: 1,
                    intervalUnit: intervalUnitOptions[0] || '',
                  });
                  setShowModal('vaccination');
                }}
                extraButton={
                  <button
                    onClick={downloadVaccinationPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar esquema
                  </button>
                }
              />

              <div className="space-y-4">
                {vaccinations.map((vacc) => (
                  <div
                    key={vacc.id}
                    className="p-4 bg-muted rounded-xl border border-border"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                      <div>
                        <p className="text-foreground font-medium">{vacc.vaccine}</p>
                        <p className="text-muted-foreground text-sm">
                          Aplicada: {vacc.applicationDate}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Dosis: {vacc.appliedDoses} / {vacc.totalDoses}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Próxima dosis: {vacc.nextDose}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Dr. {vacc.veterinarian}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-sm ${
                            vacc.status === 'Completado'
                              ? 'border border-primary/20 bg-primary/10 text-primary'
                              : vacc.status === 'Próxima dosis'
                              ? 'border border-border bg-muted text-foreground'
                              : vacc.status === 'Vencida'
                              ? 'border border-destructive/20 bg-destructive/10 text-destructive'
                              : 'border border-accent/30 bg-accent/10 text-foreground'
                          }`}
                        >
                          {vacc.status}
                        </span>

                        <button
                          onClick={() => openViewModal('vaccination', vacc)}
                          className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                        >
                          <FileText className="w-4 h-4" />
                          Ver
                        </button>

                        <button
                          onClick={() => void downloadSingleVaccinationPdf(vacc)}
                          className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors hover:bg-border"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        <button
                          onClick={() =>
                            openDeleteModal(
                              vacc.id,
                              'vaccination',
                              `vacuna ${vacc.vaccine}`
                            )
                          }
                          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {vaccinations.length === 0 && (
                  <EmptyText text="No hay vacunas registradas" />
                )}
              </div>
            </section>
          )}

          {activeTab === 'treatments' && (
            <section>
              <SectionHeader
                title="Tratamientos y servicios"
                buttonText="Nuevo registro"
                onAdd={() => {
                  setFormData({});
                  setShowModal('treatment');
                }}
                extraButton={
                  <button
                    type="button"
                    onClick={() => void downloadAllTreatmentsPdf()}
                    className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border"
                  >
                    <Download className="w-4 h-4" />
                    Descargar todos en PDF
                  </button>
                }
              />

              <div className="space-y-4">
                {treatments.map((treat) => (
                  <div
                    key={treat.id}
                    className="p-4 bg-muted rounded-xl border border-border"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-4 mb-2">
                      <div>
                        <p className="text-foreground font-medium">{treat.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {treat.type} - {treat.category}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Dr. {treat.veterinarian}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-sm ${
                            treat.status === 'Activo' ||
                            treat.status === 'Completado'
                              ? 'border border-primary/20 bg-primary/10 text-primary'
                              : treat.status === 'Resultado recibido'
                              ? 'border border-border bg-muted text-foreground'
                              : 'border border-accent/30 bg-accent/10 text-foreground'
                          }`}
                        >
                          {treat.status}
                        </span>

                        <button
                          onClick={() => openViewModal('treatment', treat)}
                          className="flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Ver
                        </button>

                        <button
                          onClick={() => downloadTreatmentPdf(treat)}
                          className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg text-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        <button
                          onClick={() =>
                            openDeleteModal(
                              treat.id,
                              'treatment',
                              treat.name || 'tratamiento o servicio'
                            )
                          }
                          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <p className="text-foreground text-sm">
                      {treat.diagnosisOrReason}
                    </p>

                    {treat.attachmentPhoto && (
                      <img
                        src={treat.attachmentPhoto}
                        alt="Fotografía adjunta"
                        className="mt-3 w-32 h-24 object-cover rounded-lg border border-border"
                      />
                    )}
                  </div>
                ))}

                {treatments.length === 0 && (
                  <EmptyText text="No hay tratamientos registrados" />
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {showModal === 'clinical' && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={MODAL_CARD_CLASS}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-foreground text-xl">
                  {editingClinicalRecord
                    ? editingClinicalRecord.sourceType === 'appointment'
                      ? 'Completar consulta'
                      : 'Editar registro clínico'
                    : 'Nuevo registro clínico'}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeFormModal}
                className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleClinicalSubmit} className="space-y-4">
              {editingClinicalRecord?.sourceType === 'appointment' && (
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-foreground">
                  Este registro fue creado automáticamente desde una cita.
                  Al guardar, quedará marcado como evaluación completada.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField
                  label="Tipo de consulta"
                  value={formData.consultationType || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, consultationType: value })
                  }
                  options={consultationTypeOptions}
                  placeholder="Seleccionar tipo de consulta"
                  required
                  max={getTodayLocal()}
                />

                <SelectField
                  label="Médico veterinario"
                  value={formData.veterinarianId || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, veterinarianId: value })
                  }
                  options={veterinarianOptions}
                  placeholder="Seleccionar veterinario"
                  required
                />
              </div>

              <TextareaField
                label="Motivo de consulta"
                value={formData.reason || ''}
                onChange={(value) => setFormData({ ...formData, reason: value })}
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextareaField
                  label="Cirugías previas"
                  value={formData.previousSurgeries || ''}
                  onChange={(value) => setFormData({ ...formData, previousSurgeries: value })}
                />

                <TextareaField
                  label="Masas visibles"
                  value={formData.visibleMasses || ''}
                  onChange={(value) => setFormData({ ...formData, visibleMasses: value })}
                />
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg border border-border">
                <h3 className="text-foreground font-bold text-base mb-4">Examen físico</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <SelectField
                    label="Piel/Mucosas"
                    value={formData.examSkin || ''}
                    onChange={(value) => setFormData({ ...formData, examSkin: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Ojos"
                    value={formData.examEyes || ''}
                    onChange={(value) => setFormData({ ...formData, examEyes: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Respiratorio"
                    value={formData.examRespiratory || ''}
                    onChange={(value) => setFormData({ ...formData, examRespiratory: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Oídos"
                    value={formData.examEars || ''}
                    onChange={(value) => setFormData({ ...formData, examEars: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Nervioso"
                    value={formData.examNervous || ''}
                    onChange={(value) => setFormData({ ...formData, examNervous: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Genito/Urinario"
                    value={formData.examGenitourinary || ''}
                    onChange={(value) => setFormData({ ...formData, examGenitourinary: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Nódulos"
                    value={formData.examNodules || ''}
                    onChange={(value) => setFormData({ ...formData, examNodules: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />

                  <SelectField
                    label="Presión"
                    value={formData.examPressure || ''}
                    onChange={(value) => setFormData({ ...formData, examPressure: value })}
                    options={examStatusOptions}
                    placeholder="Seleccionar"
                  />
                </div>
              </div>

              <TextareaField
                label="Diagnóstico"
                value={formData.diagnosis || ''}
                onChange={(value) =>
                  setFormData({ ...formData, diagnosis: value })
                }
                required
              />

              <TextareaField
                label="Tratamiento indicado"
                value={formData.treatment || ''}
                onChange={(value) =>
                  setFormData({ ...formData, treatment: value })
                }
                required
              />

              <TextareaField
                label="Observaciones"
                value={formData.observations || ''}
                onChange={(value) =>
                  setFormData({ ...formData, observations: value })
                }
              />

              <FormActions
                submitText={editingClinicalRecord ? 'Guardar cambios' : 'Guardar'}
                onCancel={closeFormModal}
              />
            </form>
          </div>
        </div>
      )}

      {showModal === 'vaccination' && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={MODAL_CARD_CLASS}>
            <h2 className="text-foreground text-xl mb-4">
              Registrar vacuna
            </h2>

            <form onSubmit={handleVaccinationSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField
                  label="Vacuna"
                  value={formData.vaccine || ''}
                  onChange={(value) => setFormData({ ...formData, vaccine: value })}
                  options={vaccineOptions}
                  placeholder="Seleccionar vacuna"
                  required
                />

                <InputField
                  label="Fecha de aplicación"
                  type="date"
                  value={formData.applicationDate || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, applicationDate: value })
                  }
                  required
                  max={getTodayLocal()}
                />

                <SelectField
                  label="Médico veterinario"
                  value={formData.veterinarianId || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, veterinarianId: value })
                  }
                  options={veterinarianOptions}
                  placeholder="Seleccionar veterinario"
                  required
                />

                <InputField
                  label="Lote, opcional"
                  value={formData.lot || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, lot: value })
                  }
                />

                <InputField
                  label="Total de dosis"
                  type="number"
                  value={formData.totalDoses || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      totalDoses: parseInt(value) || 0,
                    })
                  }
                  required
                  min={1}
                  step={1}
                />

                <InputField
                  label="Dosis aplicadas"
                  type="number"
                  value={formData.appliedDoses || ''}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      appliedDoses: parseInt(value) || 0,
                    })
                  }
                  required
                  min={1}
                  step={1}
                />

                <InputField
                  label="Intervalo"
                  type="number"
                  value={formData.interval || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, interval: value })
                  }
                  required
                  min={1}
                  step={1}
                />

                <SelectField
                  label="Unidad del intervalo"
                  value={formData.intervalUnit || ''}
                  onChange={(value) =>
                    setFormData({ ...formData, intervalUnit: value })
                  }
                  options={intervalUnitOptions}
                  placeholder="Seleccionar"
                  required
                />
              </div>

              <TextareaField
                label="Notas"
                value={formData.notes || ''}
                onChange={(value) => setFormData({ ...formData, notes: value })}
              />

              <FormActions onCancel={closeFormModal} />
            </form>
          </div>
        </div>
      )}

      {showModal === 'treatment' && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={MODAL_CARD_CLASS}>
            <h2 className="text-foreground text-xl mb-4">
              Nuevo tratamiento o servicio
            </h2>

            <form onSubmit={handleTreatmentSubmit} className="space-y-4">
              <SelectField
                label="Tipo"
                value={formData.type || ''}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    type: value,
                    name: '',
                    category: '',
                  })
                }
                options={treatmentTypeOptions}
                placeholder="Seleccionar tipo"
                required
              />

              {formData.type === 'Tratamiento médico' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField
                      label="Nombre del tratamiento"
                      value={formData.name || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, name: value })
                      }
                      required
                    />

                    <InputField
                      label="Categoría"
                      value={formData.category || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, category: value })
                      }
                      required
                    />

                    <SelectField
                      label="Médico veterinario"
                      value={formData.veterinarianId || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, veterinarianId: value })
                      }
                      options={veterinarianOptions}
                      placeholder="Seleccionar veterinario"
                      required
                    />

                    <SelectField
                      label="Estado"
                      value={formData.status || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, status: value })
                      }
                      options={treatmentStatusOptions}
                      placeholder="Seleccionar"
                      required
                    />
                  </div>

                  <TextareaField
                    label="Diagnóstico o motivo"
                    value={formData.diagnosisOrReason || ''}
                    onChange={(value) =>
                      setFormData({ ...formData, diagnosisOrReason: value })
                    }
                    required
                  />
                </>
              )}

              {formData.type === 'Servicio de laboratorio' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField
                      label="Tipo de prueba"
                      value={formData.name || ''}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          name: value,
                          category: 'Pruebas laboratorio',
                        })
                      }
                      options={labTestOptions}
                      placeholder="Seleccionar prueba"
                      required
                    />

                    <SelectField
                      label="Médico veterinario"
                      value={formData.veterinarianId || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, veterinarianId: value })
                      }
                      options={veterinarianOptions}
                      placeholder="Seleccionar veterinario"
                      required
                    />

                    <SelectField
                      label="Estado del resultado"
                      value={formData.status || ''}
                      onChange={(value) =>
                        setFormData({ ...formData, status: value })
                      }
                      options={treatmentStatusOptions}
                      placeholder="Seleccionar"
                      required
                    />
                  </div>

                  <TextareaField
                    label="Motivo de solicitud"
                    value={formData.diagnosisOrReason || ''}
                    onChange={(value) =>
                      setFormData({ ...formData, diagnosisOrReason: value })
                    }
                    required
                  />
                </>
              )}

              {formData.type && (
                <div className="bg-muted border border-border rounded-xl p-4">
                  <label className="block text-foreground mb-3 text-sm font-medium">
                    Fotografía adjunta, opcional
                  </label>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {formData.attachmentPhoto ? (
                      <img
                        src={formData.attachmentPhoto}
                        alt="Fotografía adjunta"
                        className="w-32 h-24 rounded-xl object-cover border-4 border-border"
                      />
                    ) : (
                      <div className="w-32 h-24 rounded-xl bg-secondary border-4 border-border flex items-center justify-center">
                        <Camera className="w-9 h-9 text-primary" />
                      </div>
                    )}

                    <div className="flex-1">
                      <p className="text-muted-foreground text-sm mb-3">
                        Puedes tomar una fotografía o subir una imagen del resultado,
                        laboratorio o evidencia del servicio.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg cursor-pointer transition-colors text-sm">
                          <Camera className="w-4 h-4" />
                          Tomar foto

                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) =>
                              handleAttachmentPhoto(e.target.files?.[0])
                            }
                            className="hidden"
                          />
                        </label>

                        <label className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg cursor-pointer transition-colors text-sm">
                          <Upload className="w-4 h-4" />
                          Subir imagen

                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleAttachmentPhoto(e.target.files?.[0])
                            }
                            className="hidden"
                          />
                        </label>

                        {formData.attachmentPhoto && (
                          <button
                            type="button"
                            onClick={removeAttachmentPhoto}
                            className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <TextareaField
                label="Observaciones"
                value={formData.observations || ''}
                onChange={(value) =>
                  setFormData({ ...formData, observations: value })
                }
              />

              <FormActions onCancel={closeFormModal} />
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
              La información fue guardada exitosamente en el expediente del paciente.
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

      {viewTarget && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={closeViewModal}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-foreground text-2xl font-semibold mb-4">
              {viewTarget.type === 'clinical'
                ? 'Detalle del historial clínico'
                : viewTarget.type === 'vaccination'
                ? 'Detalle de vacunación'
                : 'Detalle del tratamiento'}
            </h3>

            {viewTarget.type === 'clinical' && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoItem label="Fecha" value={(viewTarget.item as ClinicalRecordExtended).date} />
                  <InfoItem label="Tipo de consulta" value={(viewTarget.item as ClinicalRecordExtended).consultationType} />
                  <InfoItem label="Veterinario" value={(viewTarget.item as ClinicalRecordExtended).veterinarian} />
                  <InfoItem label="Registrado por" value={(viewTarget.item as ClinicalRecordExtended).createdByName || 'Sistema'} />
                  <InfoItem label="Estado" value={(viewTarget.item as ClinicalRecordExtended).clinicalStatus} />
                </div>
                <InfoItem label="Motivo" value={(viewTarget.item as ClinicalRecordExtended).reason} />
                <InfoItem label="Cirugías previas" value={(viewTarget.item as ClinicalRecordExtended).previousSurgeries} />
                <InfoItem label="Masas visibles" value={(viewTarget.item as ClinicalRecordExtended).visibleMasses} />
                <InfoItem label="Diagnóstico" value={(viewTarget.item as ClinicalRecordExtended).diagnosis} />
                <InfoItem label="Tratamiento" value={(viewTarget.item as ClinicalRecordExtended).treatment} />
                <InfoItem label="Observaciones" value={(viewTarget.item as ClinicalRecordExtended).observations} />
              </div>
            )}

            {viewTarget.type === 'vaccination' && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoItem label="Vacuna" value={(viewTarget.item as VaccinationExtended).vaccine} />
                  <InfoItem label="Fecha de aplicación" value={(viewTarget.item as VaccinationExtended).applicationDate} />
                  <InfoItem label="Veterinario" value={(viewTarget.item as VaccinationExtended).veterinarian} />
                  <InfoItem label="Registrado por" value={(viewTarget.item as VaccinationExtended).createdByName || 'Sistema'} />
                  <InfoItem label="Estado" value={(viewTarget.item as VaccinationExtended).status} />
                  <InfoItem label="Dosis aplicada" value={`${(viewTarget.item as VaccinationExtended).appliedDoses ?? 0} / ${(viewTarget.item as VaccinationExtended).totalDoses ?? 0}`} />
                  <InfoItem label="Próxima dosis" value={(viewTarget.item as VaccinationExtended).nextDose} />
                </div>
                <InfoItem label="Lote" value={(viewTarget.item as VaccinationExtended).lot} />
                <InfoItem label="Notas" value={(viewTarget.item as VaccinationExtended).notes} />
              </div>
            )}

            {viewTarget.type === 'treatment' && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoItem label="Nombre" value={(viewTarget.item as TreatmentServiceExtended).name} />
                  <InfoItem label="Tipo" value={(viewTarget.item as TreatmentServiceExtended).type} />
                  <InfoItem label="Categoría" value={(viewTarget.item as TreatmentServiceExtended).category} />
                  <InfoItem label="Estado" value={(viewTarget.item as TreatmentServiceExtended).status} />
                  <InfoItem label="Veterinario" value={(viewTarget.item as TreatmentServiceExtended).veterinarian} />
                  <InfoItem label="Registrado por" value={(viewTarget.item as TreatmentServiceExtended).createdByName || 'Sistema'} />
                  <InfoItem label="Fecha" value={(viewTarget.item as TreatmentServiceExtended).requestDate} />
                </div>
                <InfoItem label="Diagnóstico o motivo" value={(viewTarget.item as TreatmentServiceExtended).diagnosisOrReason} />
                <InfoItem label="Observaciones" value={(viewTarget.item as TreatmentServiceExtended).observations} />
                {(viewTarget.item as TreatmentServiceExtended).attachmentPhoto && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-2">Fotografía adjunta</p>
                    <img
                      src={(viewTarget.item as TreatmentServiceExtended).attachmentPhoto}
                      alt="Adjunto del registro"
                      className="max-h-64 rounded-xl border border-border object-cover"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeViewModal}
                className="px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[80]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={closeDeleteModal}
              className="absolute top-4 right-4 p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>

            <h3 className="text-foreground text-xl text-center mb-2">
              ¿Estás seguro de eliminar?
            </h3>

            <p className="text-muted-foreground text-sm text-center mb-6">
              Se eliminará el registro de{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget.title}
              </span>
              . Esta acción no se puede deshacer.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground transition-colors hover:bg-destructive/90"
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
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              Registro eliminado correctamente
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              La información fue eliminada exitosamente del expediente del paciente.
            </p>

            <button
              onClick={closeDeleteSuccessModal}
              className="w-full px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <label className="text-muted-foreground text-sm">{label}</label>
      <p className="text-foreground font-medium">{value || 'N/A'}</p>
    </div>
  );
}

function RecordLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="text-sm mt-2">
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value || 'N/A'}</span>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground text-center py-8">
      {text}
    </p>
  );
}

function SectionHeader({
  title,
  buttonText,
  onAdd,
  extraButton,
}: {
  title: string;
  buttonText: string;
  onAdd: () => void;
  extraButton?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
      <h3 className="text-foreground text-lg">{title}</h3>

      <div className="flex flex-col sm:flex-row gap-2">
        {extraButton}

        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {buttonText}
        </button>
      </div>
    </div>
  );
}

function InputField({
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
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
        rows={2}
        required={required}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-foreground mb-2 text-sm">
        {label}
      </label>

      <ThemedSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
        required={required}
      >
        <option value="">{placeholder}</option>

        {options.map((option) => (
          <option
            key={typeof option === 'string' ? option : option.value}
            value={typeof option === 'string' ? option : option.value}
          >
            {typeof option === 'string' ? option : option.label}
          </option>
        ))}
      </ThemedSelect>
    </div>
  );
}

function FormActions({
  onCancel,
  submitText = 'Guardar',
}: {
  onCancel: () => void;
  submitText?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-start gap-4 pt-4">
      <button
        type="submit"
        className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
      >
        {submitText}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full sm:w-auto px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
