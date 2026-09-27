import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useParams, Link, useLocation } from 'react-router';
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
  Eye,
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
import { formatDateForDisplay } from '../utils/dateFormat';
import ThemedSelect from '../components/ThemedSelect';
import PdfPreviewModal from '../components/PdfPreviewModal';
import { useModulePermissions } from '../hooks/useModulePermissions';
import { requestJson } from '../utils/apiClient';
import { compressImageFile } from '../utils/imageCompression';
import { loadMediaAsDataUrl, resolveMediaUrl } from '../utils/media';

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
  'patient-form-shell bg-card border border-border rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl';

export default function PatientDetail() {
  const { permissions } = useModulePermissions('patients');
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

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
  const [pdfPreview, setPdfPreview] = useState<{
    url: string;
    title: string;
    filename: string;
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

  useEffect(() => {
    const requestedTab = location.state && typeof location.state === 'object'
      ? (location.state as { activeTab?: string }).activeTab
      : undefined;

    if (requestedTab === 'vaccination') {
      setActiveTab('vaccination');
    }
  }, [location.state]);

  const mapCatalogNames = (items: CatalogItem[]) =>
    items.map((item) => item.nombre);

  const fetchCatalogSafely = async (
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    try {
      const data = await requestJson<CatalogItem[]>(`catalogos/${endpoint}`, {
        defaultError: `Error al cargar catálogo ${endpoint}`,
      });
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
      requestJson<CatalogItem[]>('catalogos/veterinarios', {
        defaultError: 'Error al cargar veterinarios',
      })
        .then((data) => {
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
      const data = await requestJson<ClinicalRecordExtended[]>(
        `historial-clinico/paciente/${id}`,
        { defaultError: 'Error al cargar historial clínico' }
      );

      setClinicalRecords(data);
    } catch (error) {
      console.error('Error al cargar historial clínico:', error);
      setClinicalRecords([]);
    }
  };

  const loadVaccinations = async () => {
    if (!id) return;

    try {
      const data = await requestJson<VaccinationExtended[]>(
        `vacunaciones/paciente/${id}`,
        { defaultError: 'Error al cargar vacunaciones' }
      );

      setVaccinations(data);
    } catch (error) {
      console.error('Error al cargar vacunaciones:', error);
      setVaccinations([]);
    }
  };

  const loadTreatments = async () => {
    if (!id) return;

    try {
      const data = await requestJson<TreatmentServiceExtended[]>(
        `tratamientos/paciente/${id}`,
        { defaultError: 'Error al cargar tratamientos y servicios' }
      );

      setTreatments(data);
    } catch (error) {
      console.error('Error al cargar tratamientos y servicios:', error);
      setTreatments([]);
    }
  };

  const loadPatientData = async () => {
    if (!id) return;

    try {
      const data = await requestJson<PatientWithPhoto>(`pacientes/${id}`, {
        defaultError: 'Error al cargar paciente',
      });

      setPatient(data);
    } catch (error) {
      console.error('Error al cargar paciente:', error);
      setPatient(null);
    }

    await Promise.all([
      loadClinicalRecords(),
      loadVaccinations(),
      loadTreatments(),
    ]);
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

  const handleAttachmentPhoto = async (file?: File) => {
    if (!file) return;

    try {
      const attachmentPhoto = await compressImageFile(file);
      setFormData({
        ...formData,
        attachmentPhoto,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible procesar la imagen');
    }
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
      const endpoint = editingClinicalRecord
        ? `historial-clinico/${editingClinicalRecord.id}`
        : 'historial-clinico';

      const method = editingClinicalRecord ? 'PUT' : 'POST';

      const body = {
        ...formData,
        patientId: id,
        clinicalStatus: 'Completado',
      };

      await requestJson<unknown>(endpoint, {
        method,
        body,
        defaultError: 'Error al guardar historial clínico',
      });

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
      await requestJson<unknown>('vacunaciones', {
        method: 'POST',
        body: {
          ...formData,
          patientId: id,
        },
        defaultError: 'Error al registrar vacuna',
      });

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
      await requestJson<unknown>('tratamientos', {
        method: 'POST',
        body: {
          ...formData,
          patientId: id,
        },
        defaultError: 'Error al agregar tratamiento o servicio',
      });

      await loadTreatments();

      setSuccessMessage('Tratamiento o servicio agregado correctamente');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al agregar tratamiento o servicio:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el tratamiento o servicio.'
      );
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

    const operations = {
      clinical: {
        endpoint: 'historial-clinico',
        description: 'registro clínico',
        reload: loadClinicalRecords,
      },
      vaccination: {
        endpoint: 'vacunaciones',
        description: 'vacuna',
        reload: loadVaccinations,
      },
      treatment: {
        endpoint: 'tratamientos',
        description: 'tratamiento o servicio',
        reload: loadTreatments,
      },
    };
    const operation = operations[deleteTarget.type];

    try {
      await requestJson<unknown>(`${operation.endpoint}/${deleteTarget.id}`, {
        method: 'DELETE',
        defaultError: `Error al eliminar ${operation.description}`,
      });
      await operation.reload();
    } catch (error) {
      console.error(`Error al eliminar ${operation.description}:`, error);
      alert(`No se pudo eliminar ${operation.description === 'vacuna' ? 'la' : 'el'} ${operation.description}.`);
      return;
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
        const patientPhoto = await loadMediaAsDataUrl(patient.photo);
        doc.addImage(patientPhoto, 'JPEG', 160, 38, 30, 30);
      } catch {
        try {
          const patientPhoto = await loadMediaAsDataUrl(patient.photo);
          doc.addImage(patientPhoto, 'PNG', 160, 38, 30, 30);
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

  const createClinicalPdf = async (record: ClinicalRecordExtended) => {
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
    doc.text(`Atendido por: ${record.veterinarian || 'N/A'}`, 16, y);
    y += 7;
    doc.text(`Registro creado por: ${record.createdByName || 'No disponible'}`, 16, y);
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
    return doc;
  };

  const createSingleVaccinationPdf = async (vacc: VaccinationExtended) => {
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
    doc.text(`Aplicada por: ${vacc.veterinarian || 'N/A'}`, 16, y);
    y += 8;
    doc.text(`Registro creado por: ${vacc.createdByName || 'No disponible'}`, 16, y);
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
    return doc;
  };

  const createClinicalHistoryPdf = async () => {
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
      return doc;
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
    return doc;
  };

  const createVaccinationPdf = async () => {
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
    return doc;
  };

  const createTreatmentPdf = async (treat: TreatmentServiceExtended) => {
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
        const attachmentPhoto = await loadMediaAsDataUrl(treat.attachmentPhoto);
        doc.addImage(attachmentPhoto, 'JPEG', 16, y, 80, 60);
      } catch {
        try {
          const attachmentPhoto = await loadMediaAsDataUrl(treat.attachmentPhoto);
          doc.addImage(attachmentPhoto, 'PNG', 16, y, 80, 60);
        } catch {
          doc.setFont('helvetica', 'normal');
          doc.text('No fue posible cargar la fotografía adjunta.', 16, y);
        }
      }
    }

    addPdfFooter(doc);
    return doc;
  };

  const createAllTreatmentsPdf = async () => {
    const { doc, logoBase64 } = await createPdfBase(
      'Tratamientos y Servicios'
    );
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 32;
    const bottomLimit = pageHeight - 24;
    let y = 94;
    let currentRecordLabel = '';
    const attachmentPhotos = await Promise.all(
      treatments.map((treatment) =>
        treatment.attachmentPhoto
          ? loadMediaAsDataUrl(treatment.attachmentPhoto).catch(() => '')
          : Promise.resolve('')
      )
    );

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

      if (attachmentPhotos[index]) {
        ensureSpace(70);

        doc.setTextColor('#6B6255');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Fotografía adjunta', 18, y);
        y += 5;

        try {
          doc.addImage(attachmentPhotos[index], 'JPEG', 18, y, 80, 60);
          y += 65;
        } catch {
          try {
            doc.addImage(attachmentPhotos[index], 'PNG', 18, y, 80, 60);
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

    return doc;
  };

  const openPdfPreview = (doc: jsPDF, title: string, filename: string) => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview({
      url: URL.createObjectURL(doc.output('blob')),
      title,
      filename,
    });
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const downloadPdfPreview = () => {
    if (!pdfPreview) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url;
    link.download = pdfPreview.filename;
    link.click();
  };

  const downloadClinicalPdf = async (record: ClinicalRecordExtended) => {
    const doc = await createClinicalPdf(record);
    doc.save(formatPdfName('Registro Clinico', patient?.petName));
  };

  const previewClinicalPdf = async (record: ClinicalRecordExtended) => {
    openPdfPreview(
      await createClinicalPdf(record),
      'Vista previa del registro clínico',
      formatPdfName('Registro Clinico', patient?.petName)
    );
  };

  const downloadSingleVaccinationPdf = async (vacc: VaccinationExtended) => {
    const doc = await createSingleVaccinationPdf(vacc);
    doc.save(formatPdfName(vacc.vaccine || 'Vacuna', patient?.petName));
  };

  const previewSingleVaccinationPdf = async (vacc: VaccinationExtended) => {
    openPdfPreview(
      await createSingleVaccinationPdf(vacc),
      'Vista previa de la vacuna',
      formatPdfName(vacc.vaccine || 'Vacuna', patient?.petName)
    );
  };

  const downloadClinicalHistoryPdf = async () => {
    const doc = await createClinicalHistoryPdf();
    doc.save(formatPdfName('Historial Clinico Completo', patient?.petName));
  };

  const previewClinicalHistoryPdf = async () => {
    openPdfPreview(
      await createClinicalHistoryPdf(),
      'Vista previa del historial clínico',
      formatPdfName('Historial Clinico Completo', patient?.petName)
    );
  };

  const downloadVaccinationPdf = async () => {
    const doc = await createVaccinationPdf();
    doc.save(formatPdfName('Esquema Vacunacion', patient?.petName));
  };

  const previewVaccinationPdf = async () => {
    openPdfPreview(
      await createVaccinationPdf(),
      'Vista previa del esquema de vacunación',
      formatPdfName('Esquema Vacunacion', patient?.petName)
    );
  };

  const downloadTreatmentPdf = async (treat: TreatmentServiceExtended) => {
    const doc = await createTreatmentPdf(treat);
    doc.save(formatPdfName('Servicio', patient?.petName));
  };

  const previewTreatmentPdf = async (treat: TreatmentServiceExtended) => {
    openPdfPreview(
      await createTreatmentPdf(treat),
      'Vista previa del tratamiento o servicio',
      formatPdfName('Servicio', patient?.petName)
    );
  };

  const downloadAllTreatmentsPdf = async () => {
    const doc = await createAllTreatmentsPdf();
    doc.save(formatPdfName('Tratamientos y Servicios', patient?.petName));
  };

  const previewAllTreatmentsPdf = async () => {
    openPdfPreview(
      await createAllTreatmentsPdf(),
      'Vista previa de tratamientos y servicios',
      formatPdfName('Tratamientos y Servicios', patient?.petName)
    );
  };

  if (!patient) {
    return (
      <div className="w-full p-[0.825rem] md:p-[1.375rem]">
        <Link
          to="/patients"
          className="mb-6 inline-flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-lg font-bold text-primary shadow-sm transition-colors hover:bg-primary hover:text-[#F7EFE6]"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          Volver a pacientes
        </Link>

        <p className="text-foreground">Paciente no encontrado</p>
      </div>
    );
  }

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem]">
      <Link
        to="/patients"
        className="mb-6 inline-flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-lg font-bold text-primary shadow-sm transition-colors hover:bg-primary hover:text-[#F7EFE6]"
      >
        <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
        Volver a pacientes
      </Link>

      <div className="bg-card rounded-2xl p-5 md:p-6 shadow-lg mb-6 border border-border">
        <div className="flex flex-col md:flex-row gap-5 md:items-center">
          <div className="w-32 h-32 rounded-2xl overflow-hidden bg-secondary border-4 border-border shadow-md flex items-center justify-center">
            {patient.photo ? (
              <img
                src={resolveMediaUrl(patient.photo)}
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
                canAdd={permissions.canCreate}
                extraButton={
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void previewClinicalHistoryPdf()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Vista previa
                    </button>
                    <button
                      onClick={() => void downloadClinicalHistoryPdf()}
                      className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Descargar historial
                    </button>
                  </div>
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
                            {formatDateForDisplay(record.date)}
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
                            ? `Atendido por: Dr. ${record.veterinarian}`
                            : 'Atención pendiente de asignar'}
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                          Registro creado por:{' '}
                          {record.createdByName || 'No disponible'}
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

                        {permissions.canEdit && <button
                          onClick={() => openEditClinicalModal(record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-muted hover:bg-border text-foreground rounded-lg text-sm transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          {record.sourceType === 'appointment' &&
                          record.clinicalStatus !== 'Completado'
                            ? 'Completar consulta'
                            : 'Editar'}
                        </button>}

                        <button
                          onClick={() => void previewClinicalPdf(record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          Vista previa
                        </button>

                        <button
                          onClick={() => downloadClinicalPdf(record)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg text-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        {permissions.canDelete && <button
                          onClick={() =>
                            openDeleteModal(
                              record.id,
                              'clinical',
                              `registro clínico del ${formatDateForDisplay(record.date)}`
                            )
                          }
                          className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </button>}
                      </div>
                    </div>

                    <RecordLine label="Motivo" value={record.reason} />
                    {record.previousSurgeries && <RecordLine label="Cirugías previas" value={record.previousSurgeries} />}
                    {record.visibleMasses && <RecordLine label="Masas visibles" value={record.visibleMasses} />}
                    <RecordLine label="Diagnóstico" value={record.diagnosis} />
                    <RecordLine label="Tratamiento" value={record.treatment} />

                    {(record.examSkin || record.examEyes || record.examRespiratory || record.examEars || record.examNervous || record.examGenitourinary || record.examNodules || record.examPressure) && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 p-3 bg-card rounded-lg border border-border text-xs">
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
                canAdd={permissions.canCreate}
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void previewVaccinationPdf()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Vista previa
                    </button>
                    <button
                      onClick={() => void downloadVaccinationPdf()}
                      className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Descargar esquema
                    </button>
                  </div>
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
                          Aplicada: {formatDateForDisplay(vacc.applicationDate)}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Dosis: {vacc.appliedDoses} / {vacc.totalDoses}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Próxima dosis: {vacc.nextDose}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {vacc.veterinarian
                            ? `Aplicada por: Dr. ${vacc.veterinarian}`
                            : 'Aplicador no disponible'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Registro creado por:{' '}
                          {vacc.createdByName || 'No disponible'}
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
                          onClick={() => void previewSingleVaccinationPdf(vacc)}
                          className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                        >
                          <Eye className="w-4 h-4" />
                          Vista previa
                        </button>

                        <button
                          onClick={() => void downloadSingleVaccinationPdf(vacc)}
                          className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors hover:bg-border"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        {permissions.canDelete && <button
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
                        </button>}
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
                canAdd={permissions.canCreate}
                onAdd={() => {
                  setFormData({});
                  setShowModal('treatment');
                }}
                extraButton={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void previewAllTreatmentsPdf()}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-primary transition-colors hover:bg-primary/20"
                    >
                      <Eye className="w-4 h-4" />
                      Vista previa
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAllTreatmentsPdf()}
                      className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-border"
                    >
                      <Download className="w-4 h-4" />
                      Descargar todos en PDF
                    </button>
                  </div>
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
                          onClick={() => void previewTreatmentPdf(treat)}
                          className="flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          Vista previa
                        </button>

                        <button
                          onClick={() => downloadTreatmentPdf(treat)}
                          className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg text-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                        {permissions.canDelete && <button
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
                        </button>}
                      </div>
                    </div>

                    <p className="text-foreground text-sm">
                      {treat.diagnosisOrReason}
                    </p>

                    {treat.attachmentPhoto && (
                      <img
                        src={resolveMediaUrl(treat.attachmentPhoto)}
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
                className="patient-form-close rounded-lg border p-2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleClinicalSubmit} className="patient-form space-y-4">
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

              <div className="patient-form-section mt-6 rounded-xl border p-4">
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

            <form onSubmit={handleVaccinationSubmit} className="patient-form space-y-4">
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

            <form onSubmit={handleTreatmentSubmit} className="patient-form space-y-4">
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
                <div className="patient-form-section rounded-xl border p-4">
                  <label className="block text-foreground mb-3 text-sm font-medium">
                    Fotografía adjunta, opcional
                  </label>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {formData.attachmentPhoto ? (
                      <img
                        src={resolveMediaUrl(formData.attachmentPhoto)}
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
                        <label className="patient-form-primary flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors">
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

                        <label className="patient-form-secondary flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors">
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
                  <InfoItem label="Fecha" value={formatDateForDisplay((viewTarget.item as ClinicalRecordExtended).date)} />
                  <InfoItem label="Tipo de consulta" value={(viewTarget.item as ClinicalRecordExtended).consultationType} />
                  <InfoItem label="Atendido por" value={(viewTarget.item as ClinicalRecordExtended).veterinarian || 'Pendiente de asignar'} />
                  <InfoItem label="Registro creado por" value={(viewTarget.item as ClinicalRecordExtended).createdByName || 'No disponible'} />
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
                  <InfoItem label="Fecha de aplicación" value={formatDateForDisplay((viewTarget.item as VaccinationExtended).applicationDate)} />
                  <InfoItem label="Aplicada por" value={(viewTarget.item as VaccinationExtended).veterinarian || 'No disponible'} />
                  <InfoItem label="Registro creado por" value={(viewTarget.item as VaccinationExtended).createdByName || 'No disponible'} />
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
                  <InfoItem label="Fecha" value={formatDateForDisplay((viewTarget.item as TreatmentServiceExtended).requestDate)} />
                </div>
                <InfoItem label="Diagnóstico o motivo" value={(viewTarget.item as TreatmentServiceExtended).diagnosisOrReason} />
                <InfoItem label="Observaciones" value={(viewTarget.item as TreatmentServiceExtended).observations} />
                {(viewTarget.item as TreatmentServiceExtended).attachmentPhoto && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-2">Fotografía adjunta</p>
                    <img
                      src={resolveMediaUrl((viewTarget.item as TreatmentServiceExtended).attachmentPhoto)}
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

      {pdfPreview && (
        <PdfPreviewModal
          url={pdfPreview.url}
          title={pdfPreview.title}
          description="Revise el documento en cualquier dispositivo antes de descargarlo. Si el visor integrado no está disponible, ábralo con el visor de PDF del dispositivo."
          onClose={closePdfPreview}
          onDownload={downloadPdfPreview}
        />
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
  canAdd = true,
}: {
  title: string;
  buttonText: string;
  onAdd: () => void;
  extraButton?: ReactNode;
  canAdd?: boolean;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
      <h3 className="text-foreground text-lg">{title}</h3>

      <div className="flex flex-col sm:flex-row gap-2">
        {extraButton}

        {canAdd && <button
          onClick={onAdd}
          className="flex items-center justify-center gap-2 px-4 py-2 text-lg bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {buttonText}
        </button>}
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
        className="patient-form-primary w-full rounded-lg px-5 py-2.5 transition-colors sm:w-auto"
      >
        {submitText}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="patient-form-secondary w-full rounded-lg px-5 py-2.5 transition-colors sm:w-auto"
      >
        Cancelar
      </button>
    </div>
  );
}
