import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Send,
  Bot,
  User,
  Download,
  Copy,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { drawUnavetPdfHeader, getUnavetLogoBase64 } from '../utils/pdfBranding';

type ChatRole = 'user' | 'assistant';

type ReportType =
  | 'general'
  | 'patients'
  | 'appointments'
  | 'grooming'
  | 'inventory'
  | 'prescriptions'
  | 'vaccinations'
  | 'treatments';

type ChartData = {
  title: string;
  description: string;
  labels: string[];
  values: number[];
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  chart?: ChartData;
  reportType?: ReportType;
  reportTitle?: string;
};

type SystemData = {
  patients: any[];
  appointments: any[];
  grooming: any[];
  inventory: any[];
  prescriptions: any[];
  vaccinations: any[];
  treatments: any[];
};

const API_URL = '/api';

const REPORT_ENDPOINTS = {
  patients: 'pacientes',
  appointments: 'citas',
  grooming: 'grooming',
  inventory: 'inventario',
  prescriptions: 'recetas',
  vaccinations: 'vacunaciones',
  treatments: 'tratamientos',
} as const;

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') ||
    localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

const QUICK_PROMPTS = [
  'Reporte general',
  'Citas por estado',
  'Stock bajo',
  'Pacientes por especie',
  'Reporte de grooming',
  'Recetas médicas',
  'Vacunación',
  'Tratamientos y servicios',
];

const REPORT_TITLES: Record<ReportType, string> = {
  general: 'Reporte general del sistema',
  patients: 'Reporte de pacientes',
  appointments: 'Reporte de citas clínicas',
  grooming: 'Reporte de grooming',
  inventory: 'Reporte de inventario',
  prescriptions: 'Reporte de recetas médicas',
  vaccinations: 'Reporte de vacunación',
  treatments: 'Reporte de tratamientos y servicios',
};

export default function AIReports() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hola, soy el asistente inteligente de UNAVET. Cada reporte analiza únicamente los datos del módulo solicitado. Puedes pedirme, por ejemplo: “genera una gráfica de citas por estado”, “analiza el stock bajo” o “dame un reporte general del sistema”.',
    },
  ]);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSendMessage = async (customPrompt?: string) => {
    const prompt = customPrompt || input.trim();

    if (!prompt || isGenerating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    try {
      const systemData = await loadSystemData();
      const reportType = detectReportType(prompt);
      const metrics = generateReportMetrics(reportType, systemData);
      const chart = generateChartForReport(reportType, systemData, prompt);
      const report = await requestAIReport(prompt, reportType, metrics, chart);

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: report,
        chart,
        reportType,
        reportTitle: REPORT_TITLES[reportType],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error al generar reporte IA:', error);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          content:
            'No se pudo generar el reporte con IA en este momento. Verifica que el backend este activo y que el proveedor IA este configurado.',
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    const cleanContent = stripReportMarkdown(message.content, message.reportTitle);
    const content = message.reportTitle
      ? `${message.reportTitle}\n\n${cleanContent}`
      : cleanContent;
    await navigator.clipboard.writeText(content);
    alert('Reporte copiado al portapapeles');
  };

  const downloadPDF = async (message: ChatMessage) => {
    const doc = new jsPDF();
    const logoBase64 = await getUnavetLogoBase64();
    const pageWidth = doc.internal.pageSize.getWidth();

    const marginX = 16;
    let y = 42;

    drawUnavetPdfHeader(
      doc,
      logoBase64,
      'Reporte generado por asistente inteligente'
    );

    doc.setTextColor('#2F2924');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const mainTitle =
      message.reportTitle || message.chart?.title || 'Reporte del sistema';
    const mainTitleLines = doc.splitTextToSize(mainTitle, pageWidth - marginX * 2 - 10);
    const mainTitleHeight = Math.max(16, mainTitleLines.length * 7 + 7);

    doc.setFillColor('#F5EFE4');
    doc.roundedRect(
      marginX,
      y - 4,
      pageWidth - marginX * 2,
      mainTitleHeight,
      2,
      2,
      'F'
    );
    doc.setFillColor('#7B5B42');
    doc.rect(marginX, y - 4, 2.5, mainTitleHeight, 'F');
    doc.text(mainTitleLines, marginX + 7, y + 6);

    y += mainTitleHeight + 7;

    if (message.chart) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(message.chart.title, marginX, y);

      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const descriptionLines = doc.splitTextToSize(
        message.chart.description,
        pageWidth - marginX * 2
      );

      doc.text(descriptionLines, marginX, y);
      y += descriptionLines.length * 5 + 6;

      const maxValue = Math.max(...message.chart.values, 1);
      const barMaxWidth = 105;

      message.chart.labels.forEach((label, index) => {
        if (y > 250) {
          addPdfFooter(doc);
          doc.addPage();
          drawUnavetPdfHeader(
            doc,
            logoBase64,
            'Reporte generado por asistente inteligente'
          );
          y = 45;
        }

        const value = message.chart?.values[index] || 0;
        const barWidth = maxValue === 0 ? 0 : (value / maxValue) * barMaxWidth;

        doc.setTextColor('#2F2924');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);

        const labelText = label.length > 25 ? `${label.slice(0, 25)}...` : label;

        doc.text(labelText, marginX, y);

        doc.setFillColor('#E8D9C5');
        doc.rect(75, y - 4, barMaxWidth, 5, 'F');

        doc.setFillColor('#7B5B42');
        doc.rect(75, y - 4, barWidth, 5, 'F');

        doc.setTextColor('#7B5B42');
        doc.setFont('helvetica', 'bold');
        doc.text(String(value), 185, y);

        y += 8;
      });

      y += 8;
    }

    const addContinuationPage = () => {
      addPdfFooter(doc);
      doc.addPage();
      drawUnavetPdfHeader(
        doc,
        logoBase64,
        'Reporte generado por asistente inteligente'
      );
      y = 43;
    };

    const ensureSpace = (height: number) => {
      if (y + height > 272) addContinuationPage();
    };

    parseReportContent(message.content, message.reportTitle).forEach((block) => {
      if (block.type === 'heading') {
        const textX = marginX + (block.number ? 15 : 7);
        const headingLines = doc.splitTextToSize(
          block.text,
          pageWidth - textX - marginX - 2
        );
        const boxHeight = Math.max(13, headingLines.length * 6 + 7);

        ensureSpace(boxHeight + 7);
        y += 3;
        doc.setFillColor('#EFE2D2');
        doc.roundedRect(
          marginX,
          y,
          pageWidth - marginX * 2,
          boxHeight,
          2,
          2,
          'F'
        );

        if (block.number) {
          doc.setFillColor('#7B5B42');
          doc.circle(marginX + 7, y + boxHeight / 2, 4.2, 'F');
          doc.setTextColor('#FFFFFF');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(block.number, marginX + 7, y + boxHeight / 2 + 1.2, {
            align: 'center',
          });
        }

        doc.setTextColor('#3D2E1F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(headingLines, textX, y + 8);
        y += boxHeight + 5;
        return;
      }

      if (block.type === 'meta') {
        const metaLines = doc.splitTextToSize(
          block.text,
          pageWidth - marginX * 2 - 10
        );
        const boxHeight = metaLines.length * 5 + 14;

        ensureSpace(boxHeight + 5);
        doc.setFillColor('#FAF0E6');
        doc.setDrawColor('#E8D9C5');
        doc.roundedRect(
          marginX,
          y,
          pageWidth - marginX * 2,
          boxHeight,
          2,
          2,
          'FD'
        );
        doc.setTextColor('#654834');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Solicitud', marginX + 5, y + 7);
        doc.setTextColor('#6B5B4D');
        doc.setFont('helvetica', 'normal');
        doc.text(metaLines, marginX + 5, y + 13);
        y += boxHeight + 5;
        return;
      }

      const textWidth = pageWidth - marginX * 2 - 11;
      const lines = doc.splitTextToSize(block.text, textWidth);
      const blockHeight = Math.max(8, lines.length * 5.5 + 3);
      ensureSpace(blockHeight + 2);

      doc.setTextColor('#4F4338');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      if (block.type === 'bullet') {
        doc.setFillColor('#7B5B42');
        doc.circle(marginX + 3, y + 2.5, 1.3, 'F');
        doc.text(lines, marginX + 9, y + 4);
      } else if (block.type === 'numbered') {
        doc.setFillColor('#EFE2D2');
        doc.circle(marginX + 4, y + 2.5, 3.6, 'F');
        doc.setTextColor('#654834');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(block.number, marginX + 4, y + 3.7, { align: 'center' });
        doc.setTextColor('#4F4338');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(lines, marginX + 11, y + 4);
      } else {
        doc.text(lines, marginX, y + 4);
      }

      y += blockHeight;
    });

    addPdfFooter(doc);

    doc.save(`reporte-${message.reportType || 'general'}-unavet-${Date.now()}.pdf`);
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 min-h-[calc(100vh-80px)] md:h-[calc(100vh-80px)] flex flex-col">
      <div className="flex items-start sm:items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shrink-0">
          <Brain className="w-5 h-5 md:w-6 md:h-6 text-[#F7EFE6]" />
        </div>

        <div className="min-w-0">
          <h1 className="text-foreground text-2xl md:text-3xl font-bold mb-2">
            Asistente IA UNAVET
          </h1>

          <p className="text-muted-foreground text-xs sm:text-sm">
            Chat inteligente para generar reportes y gráficas del prototipo.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-lg flex-1 min-h-[70vh] md:min-h-0 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-foreground via-muted-foreground to-primary px-4 md:px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#F7EFE6]/15 border border-[#F7EFE6]/20 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-[#F7EFE6]" />
            </div>

            <div className="min-w-0">
              <h2 className="text-[#F7EFE6] font-medium text-sm md:text-base">
                Chat de análisis inteligente
              </h2>

              <p className="text-[#F5DDB4] text-[11px] md:text-xs truncate">
                Analiza pacientes, citas, grooming, inventario, recetas, vacunas y tratamientos.
              </p>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-4 py-3 border-b border-border bg-muted">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSendMessage(prompt)}
                disabled={isGenerating}
                className="whitespace-nowrap px-3 py-2 bg-secondary hover:bg-border text-foreground rounded-full text-[11px] sm:text-xs transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-5 bg-card">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 sm:gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-[#F7EFE6]" />
                </div>
              )}

              <div
                className={`max-w-[82%] sm:max-w-[85%] md:max-w-[78%] rounded-2xl p-3 md:p-4 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-[#F7EFE6]'
                    : 'bg-card border border-border text-foreground'
                }`}
              >
                {message.reportTitle && (
                  <p className="mb-2 text-sm font-bold text-primary">
                    {message.reportTitle}
                  </p>
                )}

                {message.role === 'assistant' ? (
                  <ReportContent
                    content={message.content}
                    reportTitle={message.reportTitle}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">
                    {message.content}
                  </p>
                )}

                {message.chart && (
                  <div className="mt-4">
                    <ChartCard chart={message.chart} />
                  </div>
                )}

                {message.role === 'assistant' && message.id !== 'welcome' && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-3 border-t border-border">
                    <button
                      onClick={() => copyMessage(message)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-muted hover:bg-border text-foreground rounded-lg text-xs sm:text-sm transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copiar
                    </button>

                    <button
                      onClick={() => downloadPDF(message)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-[#F7EFE6] rounded-lg text-xs sm:text-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Descargar PDF
                    </button>
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
              )}
            </div>
          ))}

          {isGenerating && (
            <div className="flex gap-2 sm:gap-3 justify-start">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-[#F7EFE6]" />
              </div>

              <div className="bg-card border border-border rounded-2xl p-3 md:p-4 shadow-sm flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando datos y generando reporte IA...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="p-3 sm:p-4 border-t border-border bg-muted">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              placeholder="Ejemplo: genera una gráfica de citas por estado..."
              className="flex-1 px-4 py-3 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isGenerating}
              className="w-full sm:w-auto px-4 py-3 bg-primary hover:bg-primary text-[#F7EFE6] rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchReportCollection(endpoint: string) {
  try {
    const response = await fetch(`${API_URL}/${endpoint}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Error al cargar ${endpoint}`);
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Error al cargar datos de ${endpoint}:`, error);
    return [];
  }
}

async function requestAIReport(
  prompt: string,
  reportType: ReportType,
  metrics: any,
  chart: ChartData
) {
  try {
    const response = await fetch(`${API_URL}/ai-reports/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt,
        reportType,
        reportTitle: REPORT_TITLES[reportType],
        metrics,
        chart,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo generar el reporte IA');
    }

    const content = data?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('Respuesta IA invalida');
    }

    return content;
  } catch (error) {
    console.warn('Fallo IA en la nube:', error);
    throw error;
  }
}

async function loadSystemData(): Promise<SystemData> {
  const [
    patients,
    appointments,
    grooming,
    inventory,
    prescriptions,
    vaccinations,
    treatments,
  ] = await Promise.all([
    fetchReportCollection(REPORT_ENDPOINTS.patients),
    fetchReportCollection(REPORT_ENDPOINTS.appointments),
    fetchReportCollection(REPORT_ENDPOINTS.grooming),
    fetchReportCollection(REPORT_ENDPOINTS.inventory),
    fetchReportCollection(REPORT_ENDPOINTS.prescriptions),
    fetchReportCollection(REPORT_ENDPOINTS.vaccinations),
    fetchReportCollection(REPORT_ENDPOINTS.treatments),
  ]);

  return {
    patients,
    appointments,
    grooming,
    inventory,
    prescriptions,
    vaccinations,
    treatments,
  };
}

function normalizeReportText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectReportType(prompt: string): ReportType {
  const normalized = normalizeReportText(prompt);

  if (normalized.includes('reporte general') || normalized.includes('resumen general')) {
    return 'general';
  }
  if (normalized.includes('cita') || normalized.includes('agenda')) {
    return 'appointments';
  }
  if (
    normalized.includes('grooming') ||
    normalized.includes('peluqueria') ||
    normalized.includes('bano')
  ) {
    return 'grooming';
  }
  if (
    normalized.includes('stock') ||
    normalized.includes('inventario') ||
    normalized.includes('producto')
  ) {
    return 'inventory';
  }
  if (
    normalized.includes('paciente') ||
    normalized.includes('mascota') ||
    normalized.includes('especie') ||
    normalized.includes('raza')
  ) {
    return 'patients';
  }
  if (normalized.includes('receta') || normalized.includes('medicamento')) {
    return 'prescriptions';
  }
  if (normalized.includes('vacuna') || normalized.includes('inmuniza')) {
    return 'vaccinations';
  }
  if (
    normalized.includes('tratamiento') ||
    normalized.includes('laboratorio') ||
    normalized.includes('servicio clinico')
  ) {
    return 'treatments';
  }

  return 'general';
}

function generateReportMetrics(reportType: ReportType, data: SystemData) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;
  const patientNames = new Map(
    data.patients.map((patient: any) => [String(patient.id), patient.petName])
  );

  if (reportType === 'patients') {
    return {
      totalPatients: data.patients.length,
      patientsBySpecies: countBy(data.patients, 'species'),
      patientsByBreed: countBy(data.patients, 'breed'),
      patientsBySex: countBy(data.patients, 'sex'),
      patientsByReproductiveStatus: countBy(data.patients, 'reproductiveStatus'),
      registrationsByDate: countBy(data.patients, 'registrationDate'),
      patientsWithoutRecordedVisit: data.patients.filter(
        (patient: any) => !patient.lastVisit
      ).length,
    };
  }

  if (reportType === 'appointments') {
    const upcoming = data.appointments
      .filter(
        (appointment: any) =>
          appointment.date >= today && appointment.status !== 'Cancelada'
      )
      .sort((a: any, b: any) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );

    return {
      totalAppointments: data.appointments.length,
      appointmentsByStatus: countBy(data.appointments, 'status'),
      appointmentsByDate: countBy(data.appointments, 'date'),
      appointmentsToday: data.appointments.filter(
        (appointment: any) => appointment.date === today
      ).length,
      upcomingAppointmentsCount: upcoming.length,
      upcomingAppointments: upcoming.slice(0, 20).map((appointment: any) => ({
        date: appointment.date,
        time: appointment.time,
        patient: appointment.petName,
        reason: appointment.reason,
        status: appointment.status,
      })),
    };
  }

  if (reportType === 'grooming') {
    const scheduledServices = data.grooming.filter(
      (service: any) => service.status !== 'Cancelada'
    );
    const upcoming = data.grooming
      .filter(
        (service: any) => service.date >= today && service.status !== 'Cancelada'
      )
      .sort((a: any, b: any) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );

    return {
      totalGroomingServices: data.grooming.length,
      groomingByStatus: countBy(data.grooming, 'status'),
      groomingByType: countBy(data.grooming, 'type'),
      groomingByDate: countBy(data.grooming, 'date'),
      servicesWithTransport: data.grooming.filter((service: any) =>
        normalizeReportText(service.type).includes('transporte')
      ).length,
      estimatedIncome: scheduledServices.reduce(
        (sum: number, service: any) =>
          sum + Number(service.groomingCost || 0) + Number(service.transportCost || 0),
        0
      ),
      upcomingServicesCount: upcoming.length,
      upcomingServices: upcoming.slice(0, 20).map((service: any) => ({
        date: service.date,
        time: service.time,
        patient: service.petName,
        type: service.type,
        status: service.status,
      })),
    };
  }

  if (reportType === 'inventory') {
    const activeInventory = data.inventory.filter(
      (product: any) => normalizeReportText(product.status) !== 'inactivo'
    );
    const lowStockProducts = activeInventory.filter(
      (product: any) => Number(product.currentStock) <= Number(product.minStock)
    );
    const outOfStockProducts = activeInventory.filter(
      (product: any) => Number(product.currentStock) === 0
    );
    const expirationLimit = new Date(now);
    expirationLimit.setDate(expirationLimit.getDate() + 30);
    const expirationLimitKey = expirationLimit.toISOString().slice(0, 10);

    return {
      totalProducts: data.inventory.length,
      inventoryByCategory: countBy(data.inventory, 'category'),
      inventoryByStatus: countBy(data.inventory, 'status'),
      totalUnits: data.inventory.reduce(
        (sum: number, product: any) => sum + Number(product.currentStock || 0),
        0
      ),
      estimatedInventoryValue: data.inventory.reduce(
        (sum: number, product: any) =>
          sum + Number(product.currentStock || 0) * Number(product.price || 0),
        0
      ),
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      lowStockProducts: lowStockProducts.map((product: any) => ({
        name: product.name || 'Producto sin nombre',
        category: product.category || 'Sin categoría',
        currentStock: Number(product.currentStock) || 0,
        minStock: Number(product.minStock) || 0,
      })),
      expiringWithin30Days: data.inventory
        .filter(
          (product: any) =>
            product.expirationDate &&
            product.expirationDate >= today &&
            product.expirationDate <= expirationLimitKey
        )
        .map((product: any) => ({
          name: product.name,
          expirationDate: product.expirationDate,
          currentStock: Number(product.currentStock) || 0,
        })),
    };
  }

  if (reportType === 'prescriptions') {
    const activePrescriptions = data.prescriptions.filter(
      (prescription: any) =>
        !normalizeReportText(prescription.status).includes('anulada')
    );
    const medications = activePrescriptions.flatMap((prescription: any) =>
      Array.isArray(prescription.medications) ? prescription.medications : []
    );

    return {
      totalPrescriptions: data.prescriptions.length,
      activePrescriptions: activePrescriptions.length,
      prescriptionsByStatus: countBy(data.prescriptions, 'status'),
      prescriptionsByDate: countBy(data.prescriptions, 'date'),
      prescriptionsByVeterinarian: countBy(data.prescriptions, 'veterinarian'),
      totalMedicationLines: medications.length,
      medicationsByName: countBy(medications, 'productName'),
      medicationsFromInventory: medications.filter(
        (medication: any) => medication.fromInventory
      ).length,
      medicationsByDeliveryMode: countBy(medications, 'deliveryMode'),
    };
  }

  if (reportType === 'vaccinations') {
    const pending = data.vaccinations
      .filter((vaccination: any) => vaccination.status !== 'Completado')
      .sort((a: any, b: any) =>
        String(a.nextDose || '9999-12-31').localeCompare(
          String(b.nextDose || '9999-12-31')
        )
      );

    return {
      totalVaccinationSchedules: data.vaccinations.length,
      vaccinationsByStatus: countBy(data.vaccinations, 'status'),
      vaccinationsByVaccine: countBy(data.vaccinations, 'vaccine'),
      vaccinationsByVeterinarian: countBy(data.vaccinations, 'veterinarian'),
      appliedDoses: data.vaccinations.reduce(
        (sum: number, vaccination: any) => sum + Number(vaccination.appliedDoses || 0),
        0
      ),
      scheduledDoses: data.vaccinations.reduce(
        (sum: number, vaccination: any) => sum + Number(vaccination.totalDoses || 0),
        0
      ),
      overdueCount: data.vaccinations.filter((vaccination: any) =>
        normalizeReportText(vaccination.status).includes('vencida')
      ).length,
      pendingVaccinations: pending.slice(0, 20).map((vaccination: any) => ({
        patient:
          patientNames.get(String(vaccination.patientId)) || 'Paciente sin nombre',
        vaccine: vaccination.vaccine,
        nextDose: vaccination.nextDose || 'Sin fecha',
        appliedDoses: Number(vaccination.appliedDoses || 0),
        totalDoses: Number(vaccination.totalDoses || 0),
        status: vaccination.status,
      })),
    };
  }

  if (reportType === 'treatments') {
    return {
      totalTreatmentsAndServices: data.treatments.length,
      treatmentsByStatus: countBy(data.treatments, 'status'),
      treatmentsByType: countBy(data.treatments, 'type'),
      treatmentsByCategory: countBy(data.treatments, 'category'),
      treatmentsByVeterinarian: countBy(data.treatments, 'veterinarian'),
      treatmentsByDate: countBy(data.treatments, 'requestDate'),
      pendingOrActive: data.treatments.filter((treatment: any) => {
        const status = normalizeReportText(treatment.status);
        return status.includes('pendiente') || status.includes('activo');
      }).length,
      recentTreatments: data.treatments.slice(0, 20).map((treatment: any) => ({
        date: treatment.requestDate,
        patient:
          patientNames.get(String(treatment.patientId)) || 'Paciente sin nombre',
        type: treatment.type,
        name: treatment.name,
        status: treatment.status,
        veterinarian: treatment.veterinarian || 'Sin asignar',
      })),
    };
  }

  const generalMetrics = generateSystemMetrics(data);
  return {
    totals: generalMetrics.totals,
    operationalAlerts: {
      lowStock: generalMetrics.inventory.lowStock,
      outOfStock: generalMetrics.inventory.outOfStock,
      pendingAppointments: generalMetrics.appointmentsByStatus?.Pendiente || 0,
      pendingGrooming: generalMetrics.groomingByStatus?.Pendiente || 0,
      overdueVaccinations: data.vaccinations.filter((vaccination: any) =>
        normalizeReportText(vaccination.status).includes('vencida')
      ).length,
      activeTreatments: data.treatments.filter((treatment: any) =>
        normalizeReportText(treatment.status).includes('activo')
      ).length,
    },
  };
}

function generateSystemMetrics(data: SystemData) {
  const lowStock = data.inventory.filter(
    (p: any) => Number(p.currentStock) <= Number(p.minStock)
  );

  const outOfStock = data.inventory.filter(
    (p: any) => Number(p.currentStock) === 0
  );

  return {
    totals: {
      patients: data.patients.length,
      appointments: data.appointments.length,
      grooming: data.grooming.length,
      inventory: data.inventory.length,
      prescriptions: data.prescriptions.length,
      vaccinations: data.vaccinations.length,
      treatments: data.treatments.length,
    },
    appointmentsByStatus: countBy(data.appointments, 'status'),
    groomingByStatus: countBy(data.grooming, 'status'),
    groomingByType: countBy(data.grooming, 'type'),
    patientsBySpecies: countBy(data.patients, 'species'),
    prescriptionsByDate: countBy(data.prescriptions, 'date'),
    inventory: {
      totalProducts: data.inventory.length,
      lowStock: lowStock.length,
      outOfStock: outOfStock.length,
      lowStockProducts: lowStock.map((p: any) => ({
        name: p.name || 'Producto sin nombre',
        currentStock: Number(p.currentStock) || 0,
        minStock: Number(p.minStock) || 0,
      })),
    },
    treatmentsByType: countBy(data.treatments, 'type'),
    treatmentsByStatus: countBy(data.treatments, 'status'),
    vaccinationsByStatus: countBy(data.vaccinations, 'status'),
  };
}

function countBy(items: any[], key: string) {
  return items.reduce((acc: Record<string, number>, item) => {
    const value = item?.[key] || 'Sin especificar';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function generateChartForReport(
  reportType: ReportType,
  data: SystemData,
  prompt: string
) {
  const normalized = normalizeReportText(prompt);

  const distributionChart = (
    title: string,
    description: string,
    items: any[],
    key: string
  ) => {
    const values = countBy(items, key);
    return normalizeChart({
      title,
      description,
      labels: Object.keys(values),
      values: Object.values(values),
    });
  };

  if (reportType === 'appointments' && /(fecha|dia|mes)/.test(normalized)) {
    return distributionChart(
      'Citas por fecha',
      'Cantidad de citas clínicas programadas en cada fecha.',
      data.appointments,
      'date'
    );
  }
  if (reportType === 'grooming' && /(tipo|modalidad|transporte)/.test(normalized)) {
    return distributionChart(
      'Grooming por tipo',
      'Distribución de servicios según su modalidad.',
      data.grooming,
      'type'
    );
  }
  if (reportType === 'patients' && normalized.includes('raza')) {
    return distributionChart(
      'Pacientes por raza',
      'Cantidad de pacientes registrados según su raza.',
      data.patients,
      'breed'
    );
  }
  if (reportType === 'patients' && normalized.includes('sexo')) {
    return distributionChart(
      'Pacientes por sexo',
      'Cantidad de pacientes registrados según su sexo.',
      data.patients,
      'sex'
    );
  }
  if (reportType === 'inventory' && normalized.includes('categoria')) {
    return distributionChart(
      'Productos por categoría',
      'Cantidad de productos registrados en cada categoría del inventario.',
      data.inventory,
      'category'
    );
  }
  if (reportType === 'prescriptions') {
    if (normalized.includes('medicamento')) {
      const medications = data.prescriptions
        .filter(
          (prescription: any) =>
            !normalizeReportText(prescription.status).includes('anulada')
        )
        .flatMap((prescription: any) =>
          Array.isArray(prescription.medications) ? prescription.medications : []
        );
      return distributionChart(
        'Medicamentos más indicados',
        'Frecuencia de aparición de cada medicamento en las recetas.',
        medications,
        'productName'
      );
    }
    if (normalized.includes('veterinario')) {
      return distributionChart(
        'Recetas por veterinario',
        'Cantidad de recetas emitidas por cada veterinario.',
        data.prescriptions,
        'veterinarian'
      );
    }
    return distributionChart(
      'Recetas médicas por estado',
      'Distribución de las recetas médicas según su estado actual.',
      data.prescriptions,
      'status'
    );
  }
  if (reportType === 'vaccinations' && normalized.includes('por vacuna')) {
    return distributionChart(
      'Esquemas por vacuna',
      'Cantidad de esquemas registrados para cada vacuna.',
      data.vaccinations,
      'vaccine'
    );
  }
  if (reportType === 'treatments' && normalized.includes('tipo')) {
    return distributionChart(
      'Tratamientos y servicios por tipo',
      'Cantidad de registros clínicos agrupados por tipo.',
      data.treatments,
      'type'
    );
  }
  if (reportType === 'treatments' && normalized.includes('categoria')) {
    return distributionChart(
      'Tratamientos y servicios por categoría',
      'Cantidad de registros clínicos agrupados por categoría.',
      data.treatments,
      'category'
    );
  }

  return generateChartFromPrompt(REPORT_TITLES[reportType], data);
}

function generateChartFromPrompt(prompt: string, data: SystemData): ChartData {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('cita')) {
    const values = countBy(data.appointments, 'status');

    return normalizeChart({
      title: 'Citas por estado',
      description:
        'Distribución de las citas clínicas según el estado registrado en el sistema.',
      labels: Object.keys(values),
      values: Object.values(values),
    });
  }

  if (normalized.includes('grooming')) {
    const values = countBy(data.grooming, 'status');

    return normalizeChart({
      title: 'Grooming por estado',
      description:
        'Clasificación de los servicios de grooming según su estado actual.',
      labels: Object.keys(values),
      values: Object.values(values),
    });
  }

  if (normalized.includes('stock') || normalized.includes('inventario')) {
    const lowStock = data.inventory.filter(
      (p: any) => Number(p.currentStock) <= Number(p.minStock)
    );

    return normalizeChart({
      title: 'Productos con stock bajo',
      description:
        'Productos que se encuentran en nivel mínimo o por debajo del mínimo configurado.',
      labels:
        lowStock.length > 0
          ? lowStock.map((p: any) => p.name || 'Producto sin nombre')
          : ['Sin stock bajo'],
      values:
        lowStock.length > 0
          ? lowStock.map((p: any) => Number(p.currentStock) || 0)
          : [0],
    });
  }

  if (
    normalized.includes('paciente') ||
    normalized.includes('mascota') ||
    normalized.includes('especie')
  ) {
    const values = countBy(data.patients, 'species');

    return normalizeChart({
      title: 'Pacientes por especie',
      description:
        'Cantidad de pacientes registrados según la especie de la mascota.',
      labels: Object.keys(values),
      values: Object.values(values),
    });
  }

  if (
    normalized.includes('vacuna') ||
    normalized.includes('vacunación') ||
    normalized.includes('vacunacion')
  ) {
    const values = countBy(data.vaccinations, 'status');

    return normalizeChart({
      title: 'Vacunas por estado',
      description:
        'Estado actual de los registros de vacunación dentro del expediente clínico.',
      labels: Object.keys(values),
      values: Object.values(values),
    });
  }

  if (
    normalized.includes('tratamiento') ||
    normalized.includes('servicio') ||
    normalized.includes('laboratorio')
  ) {
    const values = countBy(data.treatments, 'status');

    return normalizeChart({
      title: 'Tratamientos y servicios por estado',
      description:
        'Clasificación de tratamientos, servicios médicos y laboratorios según su estado.',
      labels: Object.keys(values),
      values: Object.values(values),
    });
  }

  if (normalized.includes('receta')) {
    return normalizeChart({
      title: 'Recetas médicas generadas',
      description:
        'Cantidad de recetas médicas registradas actualmente en el prototipo.',
      labels: ['Recetas generadas'],
      values: [data.prescriptions.length],
    });
  }

  return normalizeChart({
    title: 'Resumen general del sistema',
    description:
      'Indicadores generales registrados actualmente en el prototipo de UNAVET.',
    labels: [
      'Pacientes',
      'Citas',
      'Grooming',
      'Inventario',
      'Recetas',
      'Vacunas',
      'Tratamientos',
    ],
    values: [
      data.patients.length,
      data.appointments.length,
      data.grooming.length,
      data.inventory.length,
      data.prescriptions.length,
      data.vaccinations.length,
      data.treatments.length,
    ],
  });
}

function normalizeChart(chart: ChartData): ChartData {
  if (chart.labels.length === 0) {
    return {
      ...chart,
      labels: ['Sin datos'],
      values: [0],
    };
  }

  return chart;
}

function generatePrototypeAIReport(
  prompt: string,
  reportType: ReportType,
  metrics: any,
  chart: ChartData
) {
  const distribution = (values?: Record<string, number>) => {
    const entries = Object.entries(values || {});
    return entries.length
      ? entries.map(([label, value]) => `${label}: ${value}`).join(', ')
      : 'Sin datos registrados';
  };
  const chartLines = chart.labels
    .map((label, index) => `- ${label}: ${chart.values[index] ?? 0}`)
    .join('\n') || '- Sin datos para representar.';
  const buildReport = (
    summary: string,
    findings: string[],
    alerts: string[],
    recommendations: string[],
    conclusion: string
  ) => `${REPORT_TITLES[reportType]}
Solicitud: ${prompt}

1) Resumen ejecutivo
${summary}

2) Hallazgos clave
${findings.map((item) => `- ${item}`).join('\n')}

Datos representados en ${chart.title}:
${chartLines}

3) Riesgos o alertas
${(alerts.length ? alerts : ['No se detectaron alertas operativas en este módulo.'])
  .map((item) => `- ${item}`)
  .join('\n')}

4) Recomendaciones
${recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n')}

5) Conclusión
${conclusion}`;

  if (reportType === 'patients') {
    return buildReport(
      `Hay ${metrics.totalPatients} paciente(s) activo(s) registrados.`,
      [
        `Por especie: ${distribution(metrics.patientsBySpecies)}.`,
        `Por sexo: ${distribution(metrics.patientsBySex)}.`,
        `Por estado reproductivo: ${distribution(metrics.patientsByReproductiveStatus)}.`,
      ],
      metrics.patientsWithoutRecordedVisit > 0
        ? [`${metrics.patientsWithoutRecordedVisit} paciente(s) no tienen una última visita registrada.`]
        : [],
      [
        'Dar seguimiento a los pacientes sin visita registrada.',
        'Usar la distribución por especie y raza para planificar la atención.',
      ],
      'El reporte refleja exclusivamente la composición y el seguimiento administrativo de los pacientes.'
    );
  }

  if (reportType === 'appointments') {
    const pending = metrics.appointmentsByStatus?.Pendiente || 0;
    const upcoming = metrics.upcomingAppointments
      .slice(0, 5)
      .map((item: any) => `${item.date} ${item.time}, ${item.patient} (${item.status})`)
      .join('; ');
    return buildReport(
      `Se registran ${metrics.totalAppointments} cita(s); ${metrics.appointmentsToday} corresponden a hoy y ${metrics.upcomingAppointmentsCount} están programadas desde hoy.`,
      [
        `Por estado: ${distribution(metrics.appointmentsByStatus)}.`,
        `Próximas citas: ${upcoming || 'No hay citas próximas'}.`,
      ],
      pending > 0 ? [`Hay ${pending} cita(s) pendientes de confirmación o seguimiento.`] : [],
      ['Confirmar las citas pendientes con sus tutores.', 'Revisar las fechas con mayor carga en la agenda.'],
      'La agenda clínica debe gestionarse priorizando citas pendientes y próximas.'
    );
  }

  if (reportType === 'grooming') {
    const pending = metrics.groomingByStatus?.Pendiente || 0;
    return buildReport(
      `Se registran ${metrics.totalGroomingServices} servicio(s), con ingresos estimados de Q${Number(metrics.estimatedIncome || 0).toFixed(2)}.`,
      [
        `Por estado: ${distribution(metrics.groomingByStatus)}.`,
        `Por tipo: ${distribution(metrics.groomingByType)}.`,
        `${metrics.servicesWithTransport} servicio(s) incluyen transporte y ${metrics.upcomingServicesCount} están próximos.`,
      ],
      pending > 0 ? [`Hay ${pending} servicio(s) de grooming pendientes.`] : [],
      ['Confirmar servicios pendientes.', 'Planificar capacidad y rutas para servicios con transporte.'],
      'El reporte muestra exclusivamente la carga, modalidad e ingreso estimado de grooming.'
    );
  }

  if (reportType === 'inventory') {
    const alerts = [
      metrics.outOfStockCount > 0 ? `${metrics.outOfStockCount} producto(s) agotados.` : '',
      metrics.lowStockCount > 0 ? `${metrics.lowStockCount} producto(s) con stock mínimo o bajo.` : '',
      metrics.expiringWithin30Days.length > 0
        ? `${metrics.expiringWithin30Days.length} producto(s) vencen en los próximos 30 días.`
        : '',
    ].filter(Boolean);
    const lowStockList = metrics.lowStockProducts
      .slice(0, 10)
      .map((item: any) => `${item.name} (${item.currentStock}/${item.minStock})`)
      .join(', ');
    return buildReport(
      `Hay ${metrics.totalProducts} producto(s) y ${metrics.totalUnits} unidad(es), con valor de venta estimado de Q${Number(metrics.estimatedInventoryValue || 0).toFixed(2)}.`,
      [`Por categoría: ${distribution(metrics.inventoryByCategory)}.`, `Stock bajo: ${lowStockList || 'Ninguno'}.`],
      alerts,
      ['Reponer primero los productos agotados y luego los de stock bajo.', 'Dar salida prioritaria a productos próximos a vencer.'],
      'Las prioridades del inventario son reposición y control de vencimientos.'
    );
  }

  if (reportType === 'prescriptions') {
    return buildReport(
      `Se registran ${metrics.totalPrescriptions} receta(s); ${metrics.activePrescriptions} están vigentes y reúnen ${metrics.totalMedicationLines} línea(s) de medicamentos.`,
      [
        `Por estado: ${distribution(metrics.prescriptionsByStatus)}.`,
        `Por veterinario: ${distribution(metrics.prescriptionsByVeterinarian)}.`,
        `Medicamentos indicados: ${distribution(metrics.medicationsByName)}.`,
        `${metrics.medicationsFromInventory} línea(s) fueron surtidas desde inventario.`,
      ],
      [],
      ['Revisar que las recetas activas tengan indicaciones completas.', 'Usar los medicamentos frecuentes para anticipar demanda.'],
      'El reporte resume únicamente la emisión y composición de las recetas médicas.'
    );
  }

  if (reportType === 'vaccinations') {
    const pending = metrics.pendingVaccinations
      .slice(0, 8)
      .map((item: any) => `${item.patient}, ${item.vaccine}, ${item.nextDose} (${item.status})`)
      .join('; ');
    return buildReport(
      `Hay ${metrics.totalVaccinationSchedules} esquema(s), con ${metrics.appliedDoses} de ${metrics.scheduledDoses} dosis aplicadas.`,
      [
        `Por estado: ${distribution(metrics.vaccinationsByStatus)}.`,
        `Por vacuna: ${distribution(metrics.vaccinationsByVaccine)}.`,
        `Seguimientos pendientes: ${pending || 'Ninguno'}.`,
      ],
      metrics.overdueCount > 0 ? [`Hay ${metrics.overdueCount} esquema(s) vencidos.`] : [],
      ['Contactar a tutores con dosis vencidas o próximas.', 'Actualizar cada esquema después de aplicar una dosis.'],
      'El seguimiento debe concentrarse en esquemas vencidos y próximas dosis.'
    );
  }

  if (reportType === 'treatments') {
    return buildReport(
      `Se registran ${metrics.totalTreatmentsAndServices} tratamiento(s), prueba(s) o servicio(s) clínicos.`,
      [
        `Por estado: ${distribution(metrics.treatmentsByStatus)}.`,
        `Por tipo: ${distribution(metrics.treatmentsByType)}.`,
        `Por categoría: ${distribution(metrics.treatmentsByCategory)}.`,
      ],
      metrics.pendingOrActive > 0
        ? [`Hay ${metrics.pendingOrActive} registro(s) pendientes o activos.`]
        : [],
      ['Priorizar los registros clínicos que siguen abiertos.', 'Verificar responsable, resultado y estado de cada servicio.'],
      'El reporte se limita al avance y clasificación de tratamientos y servicios clínicos.'
    );
  }

  const alerts = metrics.operationalAlerts || {};
  return buildReport(
    `El sistema registra ${metrics.totals.patients} paciente(s), ${metrics.totals.appointments} cita(s), ${metrics.totals.grooming} grooming, ${metrics.totals.inventory} producto(s), ${metrics.totals.prescriptions} receta(s), ${metrics.totals.vaccinations} esquema(s) y ${metrics.totals.treatments} tratamiento(s).`,
    ['La gráfica compara los totales actuales de los módulos principales.'],
    [
      alerts.outOfStock > 0 ? `${alerts.outOfStock} producto(s) agotados.` : '',
      alerts.pendingAppointments > 0 ? `${alerts.pendingAppointments} cita(s) pendientes.` : '',
      alerts.overdueVaccinations > 0 ? `${alerts.overdueVaccinations} vacunación(es) vencidas.` : '',
    ].filter(Boolean),
    ['Atender primero las alertas operativas.', 'Abrir el reporte específico de cada módulo para revisar detalles.'],
    'Esta es una vista ejecutiva general; cada reporte por módulo presenta su análisis especializado.'
  );
}

function generateLegacyPrototypeAIReport(
  prompt: string,
  metrics: any,
  chart: ChartData
) {
  const recommendations: string[] = [];

  if (metrics.inventory.lowStock > 0) {
    recommendations.push(
      `Hay ${metrics.inventory.lowStock} producto(s) con stock bajo. Se recomienda revisar el inventario y planificar reabastecimiento.`
    );
  }

  if ((metrics.appointmentsByStatus?.Pendiente || 0) > 0) {
    recommendations.push(
      `Existen ${metrics.appointmentsByStatus.Pendiente} cita(s) pendientes. Se recomienda contactar a los tutores para confirmar asistencia.`
    );
  }

  if ((metrics.groomingByStatus?.Pendiente || 0) > 0) {
    recommendations.push(
      `Hay ${metrics.groomingByStatus.Pendiente} servicio(s) de grooming pendiente(s). Se recomienda validar disponibilidad y horario.`
    );
  }

  if ((metrics.vaccinationsByStatus?.['Próxima dosis'] || 0) > 0) {
    recommendations.push(
      'Existen vacunas con próxima dosis programada. Se recomienda dar seguimiento al esquema de vacunación.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'No se detectan alertas críticas con los datos actuales del prototipo.'
    );
  }

  const chartLines = chart.labels
    .map((label, index) => `- ${label}: ${chart.values[index]}`)
    .join('\n');

  return `Reporte solicitado:
${prompt}

Resumen del análisis:
Actualmente el sistema registra ${metrics.totals.patients} paciente(s), ${metrics.totals.appointments} cita(s), ${metrics.totals.grooming} servicio(s) de grooming, ${metrics.totals.inventory} producto(s) en inventario, ${metrics.totals.prescriptions} receta(s), ${metrics.totals.vaccinations} vacuna(s) y ${metrics.totals.treatments} tratamiento(s) o servicio(s).

Gráfica generada:
${chart.title}

${chart.description}

Datos representados:
${chartLines}

Interpretación:
La gráfica permite visualizar el comportamiento principal solicitado con base en la información registrada en el prototipo. Estos datos ayudan a identificar carga operativa, seguimiento clínico, control de inventario y servicios pendientes.

Recomendaciones:
${recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Conclusión:
El asistente inteligente permite consultar información del sistema de forma conversacional y convertir los datos registrados en reportes visuales útiles para la toma de decisiones dentro de UNAVET.`;
}

type ReportBlock =
  | { type: 'heading'; text: string; number?: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; text: string; number: string }
  | { type: 'meta'; text: string };

function cleanReportLine(value: string) {
  const cleaned = value
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\*\s+/, '- ')
    .replace(/\*+/g, '')
    .trim();

  return /^[-_=]{3,}$/.test(cleaned) ? '' : cleaned;
}

function stripReportMarkdown(content: string, reportTitle?: string) {
  return content
    .split(/\r?\n/)
    .map(cleanReportLine)
    .filter(
      (line, index, lines) =>
        line &&
        !(
          reportTitle &&
          index === lines.findIndex(Boolean) &&
          normalizeReportText(line) === normalizeReportText(reportTitle)
        )
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function parseReportContent(content: string, reportTitle?: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((rawLine) => {
    const line = cleanReportLine(rawLine);
    if (!line) return;

    if (
      reportTitle &&
      normalizeReportText(line) === normalizeReportText(reportTitle)
    ) {
      return;
    }

    if (/^solicitud\s*:/i.test(line)) {
      blocks.push({ type: 'meta', text: line.replace(/^solicitud\s*:\s*/i, '') });
      return;
    }

    const section = line.match(
      /^(?:([1-5])[\).:-]?\s*)?(Resumen ejecutivo|Hallazgos clave|Riesgos o alertas|Recomendaciones|Conclusi[oó]n)\s*:?\s*(.*)$/i
    );

    if (section) {
      blocks.push({
        type: 'heading',
        number: section[1],
        text: section[2],
      });
      if (section[3]) blocks.push({ type: 'paragraph', text: section[3] });
      return;
    }

    const bullet = line.match(/^(?:[-•]|\u2022)\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1] });
      return;
    }

    const numbered = line.match(/^(\d+)[\).]\s+(.+)$/);
    if (numbered) {
      blocks.push({ type: 'numbered', number: numbered[1], text: numbered[2] });
      return;
    }

    const previous = blocks[blocks.length - 1];
    if (previous?.type === 'paragraph') {
      previous.text = `${previous.text} ${line}`;
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  });

  return blocks;
}

function ReportContent({
  content,
  reportTitle,
}: {
  content: string;
  reportTitle?: string;
}) {
  const blocks = parseReportContent(content, reportTitle);

  return (
    <div className="text-sm text-foreground">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <div
              key={`${block.type}-${index}`}
              className="flex items-center gap-2 mt-5 first:mt-0 mb-2 pb-2 border-b border-border"
            >
              {block.number && (
                <span className="w-6 h-6 rounded-full bg-primary text-[#F7EFE6] text-xs font-bold flex items-center justify-center shrink-0">
                  {block.number}
                </span>
              )}
              <h4 className="font-bold text-foreground capitalize">
                {block.text}
              </h4>
            </div>
          );
        }

        if (block.type === 'meta') {
          return (
            <div
              key={`${block.type}-${index}`}
              className="mb-4 px-3 py-2 rounded-lg bg-muted border border-border text-xs text-muted-foreground"
            >
              <span className="font-bold text-primary">Solicitud: </span>
              {block.text}
            </div>
          );
        }

        if (block.type === 'bullet') {
          return (
            <div key={`${block.type}-${index}`} className="flex gap-2.5 mb-2 leading-6">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <p>{block.text}</p>
            </div>
          );
        }

        if (block.type === 'numbered') {
          return (
            <div key={`${block.type}-${index}`} className="flex gap-2.5 mb-2 leading-6">
              <span className="mt-0.5 w-6 h-6 rounded-full bg-muted text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {block.number}
              </span>
              <p>{block.text}</p>
            </div>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="mb-3 leading-7 text-foreground">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartData }) {
  const maxValue = Math.max(...chart.values, 1);

  return (
    <div className="bg-muted border border-border rounded-2xl p-3 md:p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />

        <h3 className="text-foreground font-medium text-sm sm:text-base truncate">
          {chart.title}
        </h3>
      </div>

      <p className="text-muted-foreground text-[11px] sm:text-xs mb-4">
        {chart.description}
      </p>

      <div className="space-y-3">
        {chart.labels.map((label, index) => {
          const value = chart.values[index] || 0;
          const percentage = maxValue === 0 ? 0 : (value / maxValue) * 100;

          return (
            <div key={`${label}-${index}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-foreground text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none">
                  {label}
                </span>

                <span className="text-primary text-xs sm:text-sm font-medium shrink-0">
                  {value}
                </span>
              </div>

              <div className="w-full h-2.5 sm:h-3 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function addPdfFooter(doc: jsPDF) {
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  doc.text(
    'UNAVET - Documento generado por el asistente inteligente',
    16,
    pageHeight - 9
  );

  doc.text(`Emitido: ${generatedAt}`, pageWidth - 16, pageHeight - 9, {
    align: 'right',
  });
}


