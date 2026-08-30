import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  Search,
  Plus,
  Download,
  CheckCircle,
  Eye,
  Edit,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type {
  Prescription,
  PrescriptionMedication,
  Patient,
  InventoryProduct,
} from '../utils/types';
import SearchablePatientSelect from '../components/SearchablePatientSelect';
import ThemedSelect from '../components/ThemedSelect';
import { drawUnavetPdfHeader, getUnavetLogoBase64 } from '../utils/pdfBranding';

const API_URL = '/api';

type CatalogItem = {
  id?: number;
  modo_entrega_id?: number;
  veterinario_id?: number;
  nombre: string;
  descripcion?: string;
  activo?: number;
};

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') ||
    localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

export default function Prescriptions() {
  const [searchParams] = useSearchParams();
  const openedPatientFromUrl = useRef('');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [deliveryModeOptions, setDeliveryModeOptions] = useState<string[]>([]);
  const [veterinarianOptions, setVeterinarianOptions] = useState<CatalogItem[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingPrescription, setEditingPrescription] =
    useState<Prescription | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [previewUrl, setPreviewUrl] = useState('');
  const [previewPrescription, setPreviewPrescription] =
    useState<Prescription | null>(null);

  const [formData, setFormData] = useState<Partial<Prescription>>({
    medications: [],
  });

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<PrescriptionMedication[]>([]);
  const [currentMed, setCurrentMed] =
    useState<Partial<PrescriptionMedication>>({});

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadPrescriptions(),
        loadPatients(),
        loadInventory(),
        loadDeliveryModes(),
        loadVeterinarians(),
      ]);
    };

    void loadInitialData();
  }, []);

  const loadPrescriptions = async () => {
    try {
      const response = await fetch(`${API_URL}/recetas`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar recetas');
      }

      const safePrescriptions = Array.isArray(data)
        ? data.map((prescription) => ({
            ...prescription,
            medications: Array.isArray(prescription.medications)
              ? prescription.medications
              : [],
          }))
        : [];

      setPrescriptions(safePrescriptions);
    } catch (error) {
      console.error('Error al cargar recetas:', error);
      setPrescriptions([]);
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

      setPatients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar pacientes:', error);
      setPatients([]);
    }
  };

  const loadInventory = async () => {
    try {
      const response = await fetch(`${API_URL}/inventario`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar inventario');
      }

      setInventory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar inventario:', error);
      setInventory([]);
    }
  };


  const loadDeliveryModes = async () => {
    try {
      setLoadingCatalogs(true);

      const response = await fetch(
        `${API_URL}/catalogos/modos-entrega-receta`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Error al cargar modos de entrega'
        );
      }

      const options = Array.isArray(data)
        ? (data as CatalogItem[])
            .map((item) => item.nombre)
            .filter(
              (nombre): nombre is string =>
                typeof nombre === 'string' && nombre.trim().length > 0
            )
        : [];

      setDeliveryModeOptions(options);
    } catch (error) {
      console.error('Error al cargar modos de entrega:', error);
      setDeliveryModeOptions([]);
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const loadVeterinarians = async () => {
    try {
      const response = await fetch(`${API_URL}/catalogos/veterinarios`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar veterinarios');
      }

      setVeterinarianOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar veterinarios:', error);
      setVeterinarianOptions([]);
    }
  };

  const filteredPrescriptions = prescriptions.filter((p) =>
    (p.tutorName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const requestedPatientId = searchParams.get('patientId') || '';

  const handlePatientSelect = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);

    if (patient) {
      setSelectedPatient(patient);
      setFormData({
        ...formData,
        patientId,
        tutorName: patient.tutorName,
        tutorPhone: patient.tutorPhone,
      });
    }
  };

  useEffect(() => {
    const patientId = searchParams.get('patientId') || '';

    if (
      !patientId ||
      patients.length === 0 ||
      loadingCatalogs ||
      openedPatientFromUrl.current === patientId
    ) {
      return;
    }

    const patient = patients.find((item) => item.id === patientId);
    if (!patient) return;

    openedPatientFromUrl.current = patientId;
    setEditingPrescription(null);
    setSelectedPatient(patient);
    setFormData({
      medications: [],
      patientId: patient.id,
      tutorName: patient.tutorName,
      tutorPhone: patient.tutorPhone,
    });
    setMedications([]);
    setCurrentMed({
      deliveryMode:
        deliveryModeOptions[0] as PrescriptionMedication['deliveryMode'],
    });
    setShowModal(true);
  }, [searchParams, patients, loadingCatalogs, deliveryModeOptions]);

  const handleProductSelect = (productId: string) => {
    const product = inventory.find((p) => p.id === productId);

    if (product) {
      setCurrentMed({
        ...currentMed,
        productId,
        productName: product.name,
        fromInventory: true,
        availableStock: product.currentStock,
      });
    }
  };

  const addMedication = () => {
    if (!currentMed.productName) {
      alert('Debe ingresar el nombre del medicamento');
      return;
    }

    if (!currentMed.deliveryMode) {
      alert('Debe seleccionar un modo de entrega');
      return;
    }

    const quantity = Number(currentMed.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      alert('La cantidad del medicamento debe ser un número entero mayor a cero');
      return;
    }

    if (
      currentMed.fromInventory &&
      currentMed.availableStock !== undefined &&
      quantity > currentMed.availableStock
    ) {
      alert(`La cantidad supera el stock disponible (${currentMed.availableStock})`);
      return;
    }

    const newMed: PrescriptionMedication = {
      id: Date.now().toString(),
      productId: currentMed.productId,
      productName: currentMed.productName!,
      fromInventory: currentMed.fromInventory || false,
      availableStock: currentMed.availableStock,
      quantity: currentMed.quantity || 0,
      instructions: currentMed.instructions || '',
      deliveryMode:
        currentMed.deliveryMode ||
        (deliveryModeOptions[0] as PrescriptionMedication['deliveryMode']),
    };

    setMedications([...medications, newMed]);
    setCurrentMed({
      deliveryMode:
        deliveryModeOptions[0] as PrescriptionMedication['deliveryMode'],
    });
  };

  const removeMedication = (id: string) => {
    setMedications(medications.filter((m) => m.id !== id));
  };

  const updateMedicationDeliveryMode = (
    id: string,
    deliveryMode: PrescriptionMedication['deliveryMode']
  ) => {
    setMedications(
      medications.map((medication) =>
        medication.id === id
          ? {
              ...medication,
              deliveryMode,
            }
          : medication
      )
    );
  };

  const sanitizeFileName = (name: string) => {
    const cleanName = name
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

    return cleanName
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getPatientByPrescription = (prescription: Prescription) => {
    return patients.find((p) => p.id === prescription.patientId);
  };

  const drawPdfFooter = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const marginX = 15;
    const tableBorder = '#D8D2C8';

    const generatedAt = new Date().toLocaleString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc.setDrawColor(tableBorder);
    doc.setLineWidth(0.4);
    doc.line(marginX, pageHeight - 15, pageWidth - marginX, pageHeight - 15);

    doc.setTextColor('#6B6255');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    doc.text(
      'UNAVET - Documento generado por el sistema clinico',
      marginX,
      pageHeight - 9
    );

    doc.text(`Emitido: ${generatedAt}`, pageWidth - marginX, pageHeight - 9, {
      align: 'right',
    });
  };

  const drawTableHeader = (
    doc: jsPDF,
    tableX: number,
    tableY: number,
    tableWidth: number,
    colMedication: number,
    colQuantity: number,
    headerRowHeight: number
  ) => {
    const tableHeader = '#6B6258';

    doc.setFillColor(tableHeader);
    doc.rect(tableX, tableY, tableWidth, headerRowHeight, 'F');

    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);

    doc.text('Medicamento', tableX + 3, tableY + 6);
    doc.text('Cantidad', tableX + colMedication + 3, tableY + 6);
    doc.text(
      'Indicaciones',
      tableX + colMedication + colQuantity + 3,
      tableY + 6
    );
  };

  const createPrescriptionPDF = async (prescription: Prescription) => {
    const doc = new jsPDF();
    const patient = getPatientByPrescription(prescription);

    const logoBase64 = await getUnavetLogoBase64();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const tableBorder = '#D8D2C8';
    const textColor = '#2F2924';
 
    const marginX = 15;
 
    doc.setFillColor('#FFFFFF');
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');

    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Receta Medica Veterinaria', marginX, 47);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);

    let dataY = 58;

    doc.text(`Mascota: ${patient?.petName || 'N/A'}`, marginX, dataY);
    dataY += 7;

    doc.text(`Tutor: ${prescription.tutorName}`, marginX, dataY);
    dataY += 7;

    doc.text(`Fecha: ${prescription.date}`, marginX, dataY);

    const tableX = marginX;
    let tableY = 84;
    const tableWidth = pageWidth - marginX * 2;

    const colMedication = 70;
    const colQuantity = 28;
    const colInstructions = tableWidth - colMedication - colQuantity;

    const headerRowHeight = 9;
    const minRowHeight = 9;

    drawTableHeader(
      doc,
      tableX,
      tableY,
      tableWidth,
      colMedication,
      colQuantity,
      headerRowHeight
    );

    tableY += headerRowHeight;

    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    prescription.medications.forEach((med) => {
      const medicationLines = doc.splitTextToSize(
        med.productName || 'N/A',
        colMedication - 5
      );

      const quantityText = med.quantity.toString() || 'N/A';

      const instructionsLines = doc.splitTextToSize(
        med.instructions || 'N/A',
        colInstructions - 5
      );

      const maxLines = Math.max(
        medicationLines.length,
        1,
        instructionsLines.length
      );

      const rowHeight = Math.max(minRowHeight, maxLines * 5 + 4);

      if (tableY + rowHeight > 250) {
        drawPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');

        tableY = 43;

        drawTableHeader(
          doc,
          tableX,
          tableY,
          tableWidth,
          colMedication,
          colQuantity,
          headerRowHeight
        );

        tableY += headerRowHeight;

        doc.setTextColor(textColor);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
      }

      doc.setFillColor('#FFFFFF');
      doc.rect(tableX, tableY, tableWidth, rowHeight, 'F');

      doc.setDrawColor(tableBorder);
      doc.setLineWidth(0.25);

      doc.line(tableX, tableY, tableX + tableWidth, tableY);
      doc.line(
        tableX,
        tableY + rowHeight,
        tableX + tableWidth,
        tableY + rowHeight
      );

      doc.line(tableX, tableY, tableX, tableY + rowHeight);
      doc.line(
        tableX + colMedication,
        tableY,
        tableX + colMedication,
        tableY + rowHeight
      );
      doc.line(
        tableX + colMedication + colQuantity,
        tableY,
        tableX + colMedication + colQuantity,
        tableY + rowHeight
      );
      doc.line(
        tableX + tableWidth,
        tableY,
        tableX + tableWidth,
        tableY + rowHeight
      );

      const textY = tableY + 6;

      doc.text(medicationLines, tableX + 3, textY);
      doc.text(quantityText, tableX + colMedication + 3, textY);
      doc.text(instructionsLines, tableX + colMedication + colQuantity + 3, textY);

      tableY += rowHeight;
    });

    let diagnosisY = tableY + 12;

    if (diagnosisY > 250) {
      drawPdfFooter(doc);
      doc.addPage();
      drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');
      diagnosisY = 43;
    }

    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Diagnostico', marginX, diagnosisY);

    diagnosisY += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);

    const diagnosisLines = doc.splitTextToSize(
      prescription.diagnosis || 'N/A',
      pageWidth - marginX * 2
    );

    doc.text(diagnosisLines, marginX, diagnosisY);

    if (prescription.observations) {
      let observationsY = diagnosisY + diagnosisLines.length * 6 + 10;

      if (observationsY > 250) {
        drawPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(doc, logoBase64, 'Sistema de Gestión Veterinaria');
        observationsY = 43;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Observaciones', marginX, observationsY);

      observationsY += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);

      const observationLines = doc.splitTextToSize(
        prescription.observations,
        pageWidth - marginX * 2
      );

      doc.text(observationLines, marginX, observationsY);
    }

    drawPdfFooter(doc);

    return doc;
  };

  const generatePDF = async (prescription: Prescription) => {
    const patient = getPatientByPrescription(prescription);
    const petName = sanitizeFileName(patient?.petName || 'Mascota');

    const doc = await createPrescriptionPDF(prescription);
    doc.save(`Receta ${petName}.pdf`);
  };

  const previewPDF = async (prescription: Prescription) => {
    const doc = await createPrescriptionPDF(prescription);
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);

    setPreviewPrescription(prescription);
    setPreviewUrl(url);
    setShowPreviewModal(true);
  };

  const closePreviewModal = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl('');
    setPreviewPrescription(null);
    setShowPreviewModal(false);
  };

  const resetForm = () => {
    setEditingPrescription(null);
    setFormData({ medications: [] });
    setMedications([]);
    setCurrentMed({});
    setSelectedPatient(null);
  };

  const openCreateModal = () => {
    resetForm();
    setCurrentMed({
      deliveryMode:
        deliveryModeOptions[0] as PrescriptionMedication['deliveryMode'],
    });
    setShowModal(true);
  };

  const openEditModal = async (prescription: Prescription) => {
    try {
      const response = await fetch(
        `${API_URL}/recetas/${prescription.id}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar la receta');
      }

      const fullPrescription = data as Prescription;
      const patient = patients.find(
        (item) => item.id === fullPrescription.patientId
      );

      setEditingPrescription(fullPrescription);
      setSelectedPatient(patient || null);
      setFormData({
        patientId: fullPrescription.patientId,
        tutorName: fullPrescription.tutorName,
        tutorPhone: fullPrescription.tutorPhone,
        veterinarianId: fullPrescription.veterinarianId || '',
        diagnosis: fullPrescription.diagnosis || '',
        observations: fullPrescription.observations || '',
      });
      setMedications(
        Array.isArray(fullPrescription.medications)
          ? fullPrescription.medications.map((medication) => ({
              ...medication,
              id:
                medication.id ||
                `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            }))
          : []
      );
      setCurrentMed({
        deliveryMode:
          deliveryModeOptions[0] as PrescriptionMedication['deliveryMode'],
      });
      setShowModal(true);
    } catch (error) {
      console.error('Error al abrir receta para edición:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la receta para editar.'
      );
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (medications.length === 0) {
      alert('Debe agregar al menos un medicamento');
      return;
    }

    try {
      const url = editingPrescription
        ? `${API_URL}/recetas/${editingPrescription.id}`
        : `${API_URL}/recetas`;

      const method = editingPrescription ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          patientId: formData.patientId,
          diagnosis: formData.diagnosis,
          observations: formData.observations,
          veterinarianId: formData.veterinarianId,
          medications,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            (editingPrescription
              ? 'Error al actualizar receta'
              : 'Error al crear receta')
        );
      }

      await loadPrescriptions();
      await loadInventory();

      setSuccessMessage(
        editingPrescription
          ? 'Receta actualizada correctamente'
          : 'Receta creada correctamente'
      );
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al guardar receta:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la receta.'
      );
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setShowModal(false);
    setSuccessMessage('');
    resetForm();
  };

  const cancelForm = () => {
    setShowModal(false);
    resetForm();
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
          Recetas Médicas
        </h1>

        <button
          onClick={openCreateModal}
          disabled={loadingCatalogs}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-[#F7EFE6] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva receta
        </button>
      </div>

      <div className="bg-card rounded-lg p-6 shadow-lg mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por tutor"
            className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredPrescriptions.map((prescription) => {
          const patient = patients.find((p) => p.id === prescription.patientId);

          return (
            <div
              key={prescription.id}
              className="bg-card rounded-lg p-6 shadow-lg"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-foreground text-lg font-medium">
                    {patient?.petName || 'N/A'}
                  </h3>

                  <p className="text-muted-foreground text-sm">
                    Tutor: {prescription.tutorName}
                  </p>

                  <p className="text-muted-foreground text-sm">
                    Fecha: {prescription.date}
                  </p>

                  <p className="text-muted-foreground text-sm">
                    Veterinario: {prescription.veterinarian || 'Sin asignar'}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Registrado por: {prescription.createdByName || 'Sistema'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(prescription)}
                    disabled={prescription.status === 'Anulada'}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed text-blue-800 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Editar
                  </button>

                  <button
                    onClick={() => previewPDF(prescription)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Vista previa
                  </button>

                  <button
                    onClick={() => generatePDF(prescription)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar PDF
                  </button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-foreground text-sm">
                  <strong>Diagnóstico:</strong> {prescription.diagnosis}
                </p>

                <div className="mt-3">
                  <p className="text-foreground text-sm font-medium mb-2">
                    Medicamentos:
                  </p>

                  {prescription.medications.map((med, index) => (
                    <div key={med.id} className="ml-4 mb-2 text-sm">
                      <p className="text-foreground">
                        {index + 1}. {med.productName} - Cantidad: {med.quantity}
                      </p>

                      <p className="text-muted-foreground">
                        Indicaciones: {med.instructions}
                      </p>

                      <p className="text-muted-foreground">
                        Entrega: {med.deliveryMode}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {filteredPrescriptions.length === 0 && (
          <div className="bg-card rounded-lg p-8 shadow-lg text-center text-muted-foreground">
            No hay recetas registradas.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto my-4 md:my-8 shadow-2xl">
            <h2 className="text-foreground text-xl mb-4">
              {editingPrescription ? 'Editar receta' : 'Nueva receta'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Paciente
                  </label>

                  <SearchablePatientSelect
                    patients={patients}
                    value={formData.patientId || ''}
                    onChange={handlePatientSelect}
                    disabled={Boolean(requestedPatientId && !editingPrescription)}
                    required
                    emptyLabel="Seleccionar paciente"
                  />

                  {requestedPatientId && !editingPrescription && (
                    <p className="text-muted-foreground text-xs mt-1">
                      Paciente vinculado desde su expediente.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-foreground mb-2 text-sm">
                    Médico veterinario
                  </label>

                  <ThemedSelect
                    value={formData.veterinarianId || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        veterinarianId: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    required
                  >
                    <option value="">Seleccionar veterinario</option>
                    {veterinarianOptions.map((veterinarian) => (
                      <option
                        key={veterinarian.veterinario_id || veterinarian.id}
                        value={veterinarian.veterinario_id || veterinarian.id}
                      >
                        {veterinarian.nombre}
                      </option>
                    ))}
                  </ThemedSelect>

                  <p className="text-muted-foreground text-xs mt-1">
                    Este dato queda registrado en el sistema, pero no aparecerá
                    en el PDF.
                  </p>
                </div>
              </div>

              {selectedPatient && (
                <div className="bg-muted border border-border rounded-lg p-4">
                  <p className="text-foreground text-sm font-medium mb-1">
                    Paciente seleccionado
                  </p>

                  <p className="text-muted-foreground text-sm">
                    Mascota: {selectedPatient.petName} | Tutor:{' '}
                    {selectedPatient.tutorName} | Teléfono:{' '}
                    {selectedPatient.tutorPhone}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-foreground mb-2 text-sm">
                  Diagnóstico
                </label>

                <textarea
                  value={formData.diagnosis || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, diagnosis: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  rows={2}
                  required
                />
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-foreground text-lg mb-3">Medicamentos</h3>

                {medications.map((med) => (
                  <div
                    key={med.id}
                    className="p-3 bg-muted rounded-lg mb-2 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4"
                  >
                    <div className="flex-1">
                      <p className="text-foreground font-medium">
                        {med.productName}
                      </p>

                      <p className="text-muted-foreground text-sm">
                        Cantidad: {med.quantity}
                      </p>

                      <p className="text-muted-foreground text-sm">
                        Indicaciones: {med.instructions}
                      </p>
                    </div>

                    <div className="w-full lg:w-72 space-y-2">
                      <div>
                        <label className="block text-foreground mb-1 text-sm">
                          Modo de entrega
                        </label>

                        <ThemedSelect
                          value={med.deliveryMode || ''}
                          onChange={(e) =>
                            updateMedicationDeliveryMode(
                              med.id,
                              e.target.value as PrescriptionMedication['deliveryMode']
                            )
                          }
                          className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                          required
                        >
                          <option value="">Seleccionar modo de entrega</option>

                          {deliveryModeOptions.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </ThemedSelect>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeMedication(med.id)}
                        className="w-full px-3 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}

                <div className="bg-muted rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-foreground mb-1 text-sm">
                        Desde inventario, opcional
                      </label>

                      <ThemedSelect
                        value={currentMed.productId || ''}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                      >
                        <option value="">Manual</option>

                        {inventory.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.currentStock})
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>

                    <div>
                      <label className="block text-foreground mb-1 text-sm">
                        Nombre del medicamento
                      </label>

                      <input
                        type="text"
                        value={currentMed.productName || ''}
                        onChange={(e) =>
                          setCurrentMed({
                            ...currentMed,
                            productName: e.target.value,
                            fromInventory: false,
                            productId: undefined,
                            availableStock: undefined,
                          })
                        }
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-foreground mb-1 text-sm">
                        Cantidad total
                      </label>

                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={currentMed.quantity || ''}
                        onChange={(e) =>
                          setCurrentMed({
                            ...currentMed,
                            quantity: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-foreground mb-1 text-sm">
                        Modo de entrega
                      </label>

                      <ThemedSelect
                        value={currentMed.deliveryMode || ''}
                        onChange={(e) =>
                          setCurrentMed({
                            ...currentMed,
                            deliveryMode:
                              e.target.value as PrescriptionMedication['deliveryMode'],
                          })
                        }
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                        required
                      >
                        <option value="">Seleccionar modo de entrega</option>

                        {deliveryModeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-foreground mb-1 text-sm">
                        Indicaciones
                      </label>

                      <textarea
                        value={currentMed.instructions || ''}
                        onChange={(e) =>
                          setCurrentMed({
                            ...currentMed,
                            instructions: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
                        rows={2}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addMedication}
                    className="w-full px-4 py-2 bg-muted-foreground hover:bg-muted-foreground text-white rounded-lg text-sm"
                  >
                    Agregar medicamento
                  </button>
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
                  rows={2}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                >
                  {editingPrescription ? 'Actualizar receta' : 'Crear receta'}
                </button>

                <button
                  type="button"
                  onClick={cancelForm}
                  className="flex-1 px-4 py-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
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
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-700" />
              </div>
            </div>

            <h3 className="text-foreground text-xl mb-2">
              {successMessage}
            </h3>

            <p className="text-muted-foreground text-sm mb-6">
              {editingPrescription
                ? 'La receta fue actualizada y el inventario se reajustó correctamente.'
                : 'La receta fue registrada exitosamente. Si un medicamento fue entregado en clínica, el stock se actualizó automáticamente.'}
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

      {showPreviewModal && previewUrl && (
        <div className="modal-backdrop fixed inset-0 flex items-center justify-center p-4 z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-foreground text-lg font-medium">
                  Vista previa de receta
                </h3>

                <p className="text-muted-foreground text-sm">
                  Revisa el documento antes de descargarlo.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {previewPrescription && (
                  <button
                    onClick={() => generatePDF(previewPrescription)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar
                  </button>
                )}

                <button
                  onClick={closePreviewModal}
                  className="p-2 bg-muted hover:bg-border text-foreground rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <iframe
              src={previewUrl}
              title="Vista previa de receta"
              className="w-full flex-1 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
