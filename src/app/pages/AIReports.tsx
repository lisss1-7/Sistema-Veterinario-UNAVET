import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Send,
  Bot,
  User,
  Download,
  Eye,
  Copy,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { drawUnavetPdfHeader, getUnavetLogoBase64 } from '../utils/pdfBranding';
import PdfPreviewModal from '../components/PdfPreviewModal';
import { useModulePermissions } from '../hooks/useModulePermissions';
import { API_URL } from '../config/api';
import { getAuthHeaders } from '../utils/apiClient';

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
  variant?: 'bars' | 'donut' | 'line';
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  chart?: ChartData;
  secondaryChart?: ChartData;
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

type DataModule = Exclude<ReportType, 'general'>;

class ReportDataError extends Error {
  modules: string[];

  constructor(modules: string[]) {
    super('No fue posible consultar los datos necesarios para el reporte.');
    this.name = 'ReportDataError';
    this.modules = modules;
  }
}

class ReportRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportRequestError';
  }
}

const REPORT_ENDPOINTS = {
  patients: 'pacientes',
  appointments: 'citas',
  grooming: 'grooming',
  inventory: 'inventario',
  prescriptions: 'recetas',
  vaccinations: 'vacunaciones',
  treatments: 'tratamientos',
} as const;

const REPORT_MODULE_LABELS: Record<DataModule, string> = {
  patients: 'pacientes',
  appointments: 'citas clínicas',
  grooming: 'peluquería y aseo',
  inventory: 'inventario',
  prescriptions: 'recetas médicas',
  vaccinations: 'vacunación',
  treatments: 'tratamientos y servicios',
};

const QUICK_PROMPTS = [
  'Reporte general',
  'Citas por estado',
  'Existencias bajas',
  'Pacientes por especie',
  'Peluquería y aseo',
  'Recetas médicas',
  'Vacunación',
  'Tratamientos y servicios',
];

const REPORT_TITLES: Record<ReportType, string> = {
  general: 'Reporte general del sistema',
  patients: 'Reporte de pacientes',
  appointments: 'Reporte de citas clínicas',
  grooming: 'Reporte de peluquería y aseo',
  inventory: 'Reporte de inventario',
  prescriptions: 'Reporte de recetas médicas',
  vaccinations: 'Reporte de vacunación',
  treatments: 'Reporte de tratamientos y servicios',
};

const REPORT_FILE_SLUGS: Record<ReportType, string> = {
  general: 'general',
  patients: 'pacientes',
  appointments: 'citas',
  grooming: 'peluqueria-y-aseo',
  inventory: 'inventario',
  prescriptions: 'recetas',
  vaccinations: 'vacunacion',
  treatments: 'tratamientos-y-servicios',
};

const REPORT_CHART_COLORS = [
  '#3D2E1F',
  '#C9965A',
  '#7B5B42',
  '#D9B382',
  '#5E4635',
  '#A87845',
  '#E6C79C',
  '#80624B',
];

export default function AIReports() {
  const { permissions } = useModulePermissions('aiReports');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hola, soy el asistente de reportes de UNAVET. Cada reporte utiliza únicamente datos actuales del módulo solicitado. Puedes pedirme, por ejemplo: “citas por estado”, “existencias bajas” o “reporte general”.',
    },
  ]);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{
    url: string;
    title: string;
    filename: string;
  } | null>(null);
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
      const detectedReportType = detectReportType(prompt);
      const previousReportType = [...messages]
        .reverse()
        .find((message) => message.reportType)?.reportType;
      const reportType = detectedReportType || previousReportType;

      if (!reportType) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant-guidance`,
            role: 'assistant',
            content:
              'Indica qué deseas analizar: pacientes, citas clínicas, peluquería y aseo, inventario, recetas, vacunación, tratamientos o un reporte general.',
          },
        ]);
        return;
      }

      const systemData = await loadSystemData(reportType);
      const metrics = generateReportMetrics(reportType, systemData);
      const chart = applyChartVariant(
        generateChartForReport(reportType, systemData, prompt)
      );
      const secondaryChart = generateComplementaryChart(
        reportType,
        systemData,
        chart
      );
      const report = await requestAIReport(prompt, reportType, metrics);

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: report,
        chart,
        secondaryChart,
        reportType,
        reportTitle: REPORT_TITLES[reportType],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error al generar reporte IA:', error);

      const errorMessage =
        error instanceof ReportDataError
          ? `No se generó el reporte porque no fue posible consultar ${formatModuleList(error.modules)}. Así evitamos mostrar cifras incompletas o incorrectas.`
          : error instanceof ReportRequestError
            ? error.message
            : 'No fue posible generar el reporte en este momento. Inténtalo de nuevo.';

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          content: errorMessage,
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

  const createPDF = async (message: ChatMessage) => {
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

    doc.setTextColor('#F7EFE6');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const mainTitle =
      message.reportTitle ||
      message.chart?.title ||
      message.secondaryChart?.title ||
      'Reporte del sistema';
    const mainTitleLines = doc.splitTextToSize(mainTitle, pageWidth - marginX * 2 - 10);
    const mainTitleHeight = Math.max(16, mainTitleLines.length * 7 + 7);

    doc.setFillColor('#3D2E1F');
    doc.roundedRect(
      marginX,
      y - 4,
      pageWidth - marginX * 2,
      mainTitleHeight,
      2,
      2,
      'F'
    );
    doc.setFillColor('#C9965A');
    doc.rect(marginX, y - 4, 2.5, mainTitleHeight, 'F');
    doc.text(mainTitleLines, marginX + 7, y + 6);

    y += mainTitleHeight + 7;

    const reportCharts = [message.chart, message.secondaryChart].filter(
      (chart): chart is ChartData => Boolean(chart)
    );

    reportCharts.forEach((chart, chartIndex) => {
      const visualChartImage =
        chart.variant === 'donut' || chart.variant === 'line'
          ? renderChartForPdf(chart)
          : null;
      const visualChartHeight =
        chart.variant === 'donut' ? 71 : chart.variant === 'line' ? 66 : 0;
      const estimatedChartHeight = visualChartImage
        ? visualChartHeight + 30
        : 30;

      if (y > 235 || y + estimatedChartHeight > 265) {
        addPdfFooter(doc);
        doc.addPage();
        drawUnavetPdfHeader(
          doc,
          logoBase64,
          'Reporte generado por asistente inteligente'
        );
        y = 45;
      }

      doc.setFillColor('#3D2E1F');
      doc.roundedRect(
        marginX,
        y - 5,
        pageWidth - marginX * 2,
        10,
        2,
        2,
        'F'
      );
      doc.setTextColor('#F7EFE6');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(chart.title, marginX + 5, y + 1.5);

      y += 10;

      doc.setTextColor('#4F4338');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const descriptionLines = doc.splitTextToSize(
        chart.description,
        pageWidth - marginX * 2
      );

      doc.text(descriptionLines, marginX, y);
      y += descriptionLines.length * 5 + 6;

      if (visualChartImage) {
        doc.addImage(
          visualChartImage,
          'PNG',
          marginX,
          y,
          pageWidth - marginX * 2,
          visualChartHeight,
          `report-chart-${chartIndex}`,
          'FAST'
        );
        y += visualChartHeight + 10;
        return;
      }

      const maxValue = Math.max(...chart.values, 1);
      const barMaxWidth = 105;

      chart.labels.forEach((label, index) => {
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

        const value = chart.values[index] || 0;
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
    });

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
        doc.setFillColor('#3D2E1F');
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
          doc.setFillColor('#F7EFE6');
          doc.circle(marginX + 7, y + boxHeight / 2, 4.2, 'F');
          doc.setTextColor('#3D2E1F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(block.number, marginX + 7, y + boxHeight / 2 + 1.2, {
            align: 'center',
          });
        }

        doc.setTextColor('#F7EFE6');
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

    const reportSlug = REPORT_FILE_SLUGS[message.reportType || 'general'];
    const dateSlug = new Date().toISOString().slice(0, 10);
    return {
      doc,
      filename: `reporte-${reportSlug}-unavet-${dateSlug}.pdf`,
      title: mainTitle,
    };
  };

  const downloadPDF = async (message: ChatMessage) => {
    const { doc, filename } = await createPDF(message);
    doc.save(filename);
  };

  const previewPDF = async (message: ChatMessage) => {
    const { doc, filename, title } = await createPDF(message);
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview({
      url: URL.createObjectURL(doc.output('blob')),
      filename,
      title: `Vista previa: ${title}`,
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

  return (
    <div className="w-full p-[0.825rem] md:p-[1.375rem] min-h-[calc(100vh-80px)] md:h-[calc(100vh-80px)] flex flex-col">
      <div className="flex items-start sm:items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shrink-0">
          <Brain className="w-5 h-5 md:w-6 md:h-6 text-[#F7EFE6]" />
        </div>

        <div className="min-w-0">
          <h1 className="text-foreground text-xl md:text-2xl font-bold mb-2">
            Asistente IA UNAVET
          </h1>

          <p className="text-muted-foreground text-xs sm:text-sm">
            Reportes y gráficas elaborados con los datos actuales del sistema.
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
                Asistente de análisis
              </h2>

              <p className="text-[#F5DDB4] text-[11px] md:text-xs truncate">
                Analiza pacientes, citas, peluquería y aseo, inventario, recetas, vacunación y tratamientos.
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
                disabled={!permissions.canCreate || isGenerating}
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
                  <p className="mb-3 rounded-xl bg-[#3D2E1F] px-3 py-2.5 text-sm font-bold text-[#F7EFE6] shadow-sm">
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

                {(message.chart || message.secondaryChart) && (
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {message.chart && <ChartCard chart={message.chart} />}
                    {message.secondaryChart && (
                      <ChartCard chart={message.secondaryChart} />
                    )}
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
                      onClick={() => void previewPDF(message)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs sm:text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Vista previa
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
                Consultando datos y preparando el reporte...
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
                if (e.key === 'Enter' && permissions.canCreate) {
                  handleSendMessage();
                }
              }}
              placeholder="Ejemplo: muestra las citas por estado..."
              maxLength={500}
              disabled={!permissions.canCreate || isGenerating}
              className="flex-1 px-4 py-3 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!permissions.canCreate || !input.trim() || isGenerating}
              className="w-full sm:w-auto px-4 py-3 bg-primary hover:bg-primary text-[#F7EFE6] rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {pdfPreview && (
        <PdfPreviewModal
          url={pdfPreview.url}
          title={pdfPreview.title}
          description="Revise el reporte en cualquier dispositivo antes de descargarlo."
          onClose={closePdfPreview}
          onDownload={downloadPdfPreview}
        />
      )}
    </div>
  );
}

async function fetchReportCollection(endpoint: string) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `No se pudo consultar ${endpoint}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`La respuesta de ${endpoint} no contiene una lista válida`);
  }

  return data;
}

async function requestAIReport(
  prompt: string,
  reportType: ReportType,
  metrics: any
) {
  try {
    const response = await fetch(`${API_URL}/ai-reports/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt,
        reportType,
        metrics,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ReportRequestError(
        data?.message || 'No fue posible generar el reporte.'
      );
    }

    const content = stripHiddenReasoning(data?.content);

    if (!content.trim()) {
      throw new ReportRequestError(
        'El reporte recibido no tiene un formato válido. Inténtalo de nuevo.'
      );
    }

    return content.trim();
  } catch (error) {
    console.warn('No fue posible obtener el reporte:', error);
    throw error;
  }
}

async function loadSystemData(reportType: ReportType): Promise<SystemData> {
  const data: SystemData = {
    patients: [],
    appointments: [],
    grooming: [],
    inventory: [],
    prescriptions: [],
    vaccinations: [],
    treatments: [],
  };
  const modules = (
    reportType === 'general'
      ? Object.keys(REPORT_ENDPOINTS)
      : [reportType]
  ) as DataModule[];
  const results = await Promise.allSettled(
    modules.map((module) =>
      fetchReportCollection(REPORT_ENDPOINTS[module])
    )
  );
  const failedModules: string[] = [];

  results.forEach((result, index) => {
    const module = modules[index];
    if (result.status === 'fulfilled') {
      data[module] = result.value;
    } else {
      console.error(
        `Error al consultar ${REPORT_MODULE_LABELS[module]} para reportes:`,
        result.reason
      );
      failedModules.push(REPORT_MODULE_LABELS[module]);
    }
  });

  if (failedModules.length > 0) throw new ReportDataError(failedModules);
  return data;
}

function formatModuleList(modules: string[]) {
  if (modules.length <= 1) return modules[0] || 'los datos solicitados';
  return `${modules.slice(0, -1).join(', ')} y ${modules[modules.length - 1]}`;
}

function normalizeReportText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function localizeReportText(value: unknown) {
  return String(value || '')
    .replace(/\bgrooming\b/gi, 'peluquería y aseo')
    .replace(/\bstock\b/gi, 'existencias');
}

function detectReportType(prompt: string): ReportType | null {
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
    normalized.includes('estetica') ||
    normalized.includes('aseo') ||
    normalized.includes('bano')
  ) {
    return 'grooming';
  }
  if (
    normalized.includes('stock') ||
    normalized.includes('existencia') ||
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

  return null;
}

function generateReportMetrics(reportType: ReportType, data: SystemData) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;
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
          appointment.date >= today &&
          !normalizeReportText(appointment.status).includes('cancelad')
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
      scheduledPets: upcoming.map((appointment: any) => ({
        petName: appointment.petName || 'Mascota sin nombre',
        date: appointment.date || '',
        time: appointment.time || '',
        status: appointment.status || 'Sin estado',
      })),
      pendingPets: data.appointments
        .filter((appointment: any) =>
          normalizeReportText(appointment.status).includes('pendiente')
        )
        .map((appointment: any) => ({
          petName: appointment.petName || 'Mascota sin nombre',
          date: appointment.date || '',
          time: appointment.time || '',
          status: appointment.status || 'Pendiente',
        })),
    };
  }

  if (reportType === 'grooming') {
    const scheduledServices = data.grooming.filter(
      (service: any) =>
        !normalizeReportText(service.status).includes('cancelad')
    );
    const upcoming = data.grooming
      .filter(
        (service: any) =>
          service.date >= today &&
          !normalizeReportText(service.status).includes('cancelad')
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
      scheduledPets: upcoming.map((service: any) => ({
        petName: service.petName || 'Mascota sin nombre',
        date: service.date || '',
        time: service.time || '',
        status: service.status || 'Sin estado',
        type: service.type || '',
      })),
      pendingPets: data.grooming
        .filter((service: any) =>
          normalizeReportText(service.status).includes('pendiente')
        )
        .map((service: any) => ({
          petName: service.petName || 'Mascota sin nombre',
          date: service.date || '',
          time: service.time || '',
          status: service.status || 'Pendiente',
          type: service.type || '',
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
      totalProducts: activeInventory.length,
      inventoryByCategory: countBy(activeInventory, 'category'),
      inventoryByStatus: countBy(activeInventory, 'status'),
      totalUnits: activeInventory.reduce(
        (sum: number, product: any) => sum + Number(product.currentStock || 0),
        0
      ),
      estimatedInventoryValue: activeInventory.reduce(
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
      expiringWithin30Days: activeInventory
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
    const vaccinatedPets = data.vaccinations.filter((vaccination: any) =>
      normalizeReportText(vaccination.status).includes('complet')
    );
    const pendingPets = data.vaccinations.filter(
      (vaccination: any) =>
        !normalizeReportText(vaccination.status).includes('complet')
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
      vaccinatedPets: vaccinatedPets.map((vaccination: any) => ({
        petName: vaccination.petName || 'Mascota sin nombre',
        vaccine: vaccination.vaccine || 'Vacuna sin nombre',
        status: vaccination.status || 'Completado',
      })),
      pendingPets: pendingPets.map((vaccination: any) => ({
        petName: vaccination.petName || 'Mascota sin nombre',
        vaccine: vaccination.vaccine || 'Vacuna sin nombre',
        nextDose: vaccination.nextDose || '',
        status: vaccination.status || 'Pendiente',
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
    };
  }

  const generalMetrics = generateSystemMetrics(data);
  return {
    totals: generalMetrics.totals,
    operationalAlerts: {
      lowStock: generalMetrics.inventory.lowStock,
      outOfStock: generalMetrics.inventory.outOfStock,
      pendingAppointments: countMatchingDistribution(
        generalMetrics.appointmentsByStatus,
        'pendiente'
      ),
      pendingGrooming: countMatchingDistribution(
        generalMetrics.groomingByStatus,
        'pendiente'
      ),
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
  const activeInventory = data.inventory.filter(
    (product: any) => normalizeReportText(product.status) !== 'inactivo'
  );
  const lowStock = activeInventory.filter(
    (p: any) => Number(p.currentStock) <= Number(p.minStock)
  );

  const outOfStock = activeInventory.filter(
    (p: any) => Number(p.currentStock) === 0
  );

  return {
    totals: {
      patients: data.patients.length,
      appointments: data.appointments.length,
      grooming: data.grooming.length,
      inventory: activeInventory.length,
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
      totalProducts: activeInventory.length,
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
    const value = localizeReportText(item?.[key] || 'Sin especificar');
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function countMatchingDistribution(
  distribution: Record<string, number>,
  expectedLabel: string
) {
  return Object.entries(distribution || {}).reduce(
    (total, [label, value]) =>
      normalizeReportText(label).includes(normalizeReportText(expectedLabel))
        ? total + Number(value || 0)
        : total,
    0
  );
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
    key: string,
    sortLabels = false
  ) => {
    return chartFromCounts(title, description, countBy(items, key), sortLabels);
  };

  if (reportType === 'appointments' && normalized.includes('mes')) {
    return chartFromCounts(
      'Citas por mes',
      'Cantidad de citas clínicas agrupadas por mes.',
      countByComputedValue(data.appointments, (item) =>
        String(item.date || '').slice(0, 7)
      ),
      true
    );
  }
  if (reportType === 'appointments' && /(fecha|dia)/.test(normalized)) {
    return distributionChart(
      'Citas por fecha',
      'Cantidad de citas clínicas programadas en cada fecha.',
      data.appointments,
      'date',
      true
    );
  }
  if (reportType === 'appointments') {
    return distributionChart(
      'Citas por estado',
      'Distribución de las citas clínicas según el estado registrado.',
      data.appointments,
      'status'
    );
  }

  if (reportType === 'grooming' && normalized.includes('mes')) {
    return chartFromCounts(
      'Servicios de peluquería y aseo por mes',
      'Cantidad de servicios agrupados por mes.',
      countByComputedValue(data.grooming, (item) =>
        String(item.date || '').slice(0, 7)
      ),
      true
    );
  }
  if (reportType === 'grooming' && /(fecha|dia)/.test(normalized)) {
    return distributionChart(
      'Servicios de peluquería y aseo por fecha',
      'Cantidad de servicios programados en cada fecha.',
      data.grooming,
      'date',
      true
    );
  }
  if (reportType === 'grooming' && /(tipo|modalidad|transporte)/.test(normalized)) {
    return distributionChart(
      'Servicios de peluquería y aseo por modalidad',
      'Distribución de servicios según su modalidad.',
      data.grooming,
      'type'
    );
  }
  if (reportType === 'grooming') {
    return distributionChart(
      'Servicios de peluquería y aseo por estado',
      'Distribución de los servicios según su estado actual.',
      data.grooming,
      'status'
    );
  }

  if (reportType === 'patients' && /(sin visita|sin consulta)/.test(normalized)) {
    const withoutVisit = data.patients.filter((patient: any) => !patient.lastVisit)
      .length;
    return normalizeChart({
      title: 'Pacientes según registro de visitas',
      description: 'Pacientes con y sin una visita registrada en su expediente.',
      labels: ['Con visita registrada', 'Sin visita registrada'],
      values: [Math.max(data.patients.length - withoutVisit, 0), withoutVisit],
    });
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
  if (reportType === 'patients') {
    return distributionChart(
      'Pacientes por especie',
      'Cantidad de pacientes activos según su especie.',
      data.patients,
      'species'
    );
  }

  const activeInventory = data.inventory.filter(
    (product: any) => normalizeReportText(product.status) !== 'inactivo'
  );
  if (reportType === 'inventory' && normalized.includes('categoria')) {
    return distributionChart(
      'Productos por categoría',
      'Cantidad de productos activos en cada categoría del inventario.',
      activeInventory,
      'category'
    );
  }
  if (reportType === 'inventory' && /(vence|vencimiento|caduc)/.test(normalized)) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 30);
    const limitKey = limit.toISOString().slice(0, 10);
    const expiring = activeInventory.filter(
      (product: any) =>
        product.expirationDate &&
        product.expirationDate >= today &&
        product.expirationDate <= limitKey
    );
    return normalizeChart({
      title: 'Productos próximos a vencer',
      description: 'Unidades de productos con vencimiento dentro de los próximos 30 días.',
      labels: expiring.map((product: any) =>
        localizeReportText(product.name || 'Producto sin nombre')
      ),
      values: expiring.map((product: any) => Number(product.currentStock) || 0),
    });
  }
  if (reportType === 'inventory') {
    const lowInventory = activeInventory.filter(
      (product: any) => Number(product.currentStock) <= Number(product.minStock)
    );
    return normalizeChart({
      title: 'Productos con existencias bajas',
      description: 'Unidades disponibles de los productos en el nivel mínimo o por debajo.',
      labels: lowInventory.map(
        (product: any) =>
          localizeReportText(product.name || 'Producto sin nombre')
      ),
      values: lowInventory.map(
        (product: any) => Number(product.currentStock) || 0
      ),
    });
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
    if (normalized.includes('mes')) {
      return chartFromCounts(
        'Recetas médicas por mes',
        'Cantidad de recetas médicas agrupadas por mes.',
        countByComputedValue(data.prescriptions, (item) =>
          String(item.date || '').slice(0, 7)
        ),
        true
      );
    }
    return distributionChart(
      'Recetas médicas por estado',
      'Distribución de las recetas médicas según su estado actual.',
      data.prescriptions,
      'status'
    );
  }
  if (reportType === 'vaccinations') {
    if (normalized.includes('veterinario')) {
      return distributionChart(
        'Esquemas de vacunación por veterinario',
        'Cantidad de esquemas agrupados por el veterinario registrado.',
        data.vaccinations,
        'veterinarian'
      );
    }
    if (/(por vacuna|tipo de vacuna)/.test(normalized)) {
      return distributionChart(
        'Esquemas por vacuna',
        'Cantidad de esquemas registrados para cada vacuna.',
        data.vaccinations,
        'vaccine'
      );
    }
    return distributionChart(
      'Esquemas de vacunación por estado',
      'Distribución de los esquemas según su estado actual.',
      data.vaccinations,
      'status'
    );
  }
  if (reportType === 'treatments') {
    if (normalized.includes('veterinario')) {
      return distributionChart(
        'Tratamientos y servicios por veterinario',
        'Cantidad de registros clínicos agrupados por veterinario.',
        data.treatments,
        'veterinarian'
      );
    }
    if (/(fecha|dia)/.test(normalized)) {
      return distributionChart(
        'Tratamientos y servicios por fecha',
        'Cantidad de registros clínicos agrupados por fecha.',
        data.treatments,
        'requestDate',
        true
      );
    }
    if (normalized.includes('tipo')) {
      return distributionChart(
        'Tratamientos y servicios por tipo',
        'Cantidad de registros clínicos agrupados por tipo.',
        data.treatments,
        'type'
      );
    }
    if (normalized.includes('categoria')) {
      return distributionChart(
        'Tratamientos y servicios por categoría',
        'Cantidad de registros clínicos agrupados por categoría.',
        data.treatments,
        'category'
      );
    }
    return distributionChart(
      'Tratamientos y servicios por estado',
      'Distribución de los registros clínicos según su estado.',
      data.treatments,
      'status'
    );
  }

  const generalMetrics = generateSystemMetrics(data);
  return normalizeChart({
    title: 'Registros actuales por módulo',
    description:
      'Conteos de registros de naturaleza distinta; muestran volumen y no comparan el desempeño entre áreas.',
    labels: [
      'Pacientes',
      'Citas clínicas',
      'Peluquería y aseo',
      'Productos de inventario',
      'Recetas médicas',
      'Esquemas de vacunación',
      'Tratamientos y servicios',
    ],
    values: [
      generalMetrics.totals.patients,
      generalMetrics.totals.appointments,
      generalMetrics.totals.grooming,
      generalMetrics.totals.inventory,
      generalMetrics.totals.prescriptions,
      generalMetrics.totals.vaccinations,
      generalMetrics.totals.treatments,
    ],
  });
}

function applyChartVariant(chart: ChartData): ChartData {
  const title = normalizeReportText(chart.title);
  const isTemporal = /(por fecha|por mes|evolucion|tendencia)/.test(title);
  const isCompactDistribution =
    chart.labels.length <= 8 &&
    /(por estado|por especie|por sexo|modalidad|categoria|registro de visitas)/.test(
      title
    );

  return {
    ...chart,
    variant: isTemporal ? 'line' : isCompactDistribution ? 'donut' : 'bars',
  };
}

function generateComplementaryChart(
  reportType: ReportType,
  data: SystemData,
  primaryChart: ChartData
): ChartData | undefined {
  const primaryTitle = normalizeReportText(primaryChart.title);
  const temporalChart = (
    title: string,
    description: string,
    items: any[],
    dateKey: string
  ) =>
    applyChartVariant(
      chartFromCounts(
        title,
        description,
        countByComputedValue(
          items.filter((item) => item?.[dateKey]),
          (item) => String(item[dateKey] || '').slice(0, 10)
        ),
        true
      )
    );
  const distributionChart = (
    title: string,
    description: string,
    items: any[],
    key: string
  ) =>
    applyChartVariant(
      chartFromCounts(title, description, countBy(items, key))
    );

  if (reportType === 'appointments') {
    return /(por fecha|por mes)/.test(primaryTitle)
      ? distributionChart(
          'Citas por estado',
          'Proporción de citas clínicas según su estado actual.',
          data.appointments,
          'status'
        )
      : temporalChart(
          'Tendencia de citas por fecha',
          'Evolución de las citas clínicas registradas en cada fecha.',
          data.appointments,
          'date'
        );
  }

  if (reportType === 'grooming') {
    return /(por fecha|por mes)/.test(primaryTitle)
      ? distributionChart(
          'Servicios por estado',
          'Proporción de servicios de peluquería y aseo según su estado.',
          data.grooming,
          'status'
        )
      : temporalChart(
          'Tendencia de servicios por fecha',
          'Evolución de los servicios de peluquería y aseo programados.',
          data.grooming,
          'date'
        );
  }

  if (reportType === 'patients') {
    const registrations = data.patients.filter(
      (patient: any) => patient.registrationDate
    );
    if (registrations.length > 0 && !/(por fecha|por mes)/.test(primaryTitle)) {
      return temporalChart(
        'Tendencia de registros de pacientes',
        'Cantidad de pacientes incorporados al sistema en cada fecha.',
        registrations,
        'registrationDate'
      );
    }
    return distributionChart(
      'Pacientes por sexo',
      'Proporción de pacientes según el sexo registrado.',
      data.patients,
      'sex'
    );
  }

  if (reportType === 'inventory') {
    const activeInventory = data.inventory.filter(
      (product: any) => normalizeReportText(product.status) !== 'inactivo'
    );
    if (primaryTitle.includes('categoria')) {
      const lowInventory = activeInventory.filter(
        (product: any) =>
          Number(product.currentStock) <= Number(product.minStock)
      );
      return {
        ...normalizeChart({
          title: 'Existencias actuales de productos en alerta',
          description:
            'Unidades disponibles de los productos que alcanzaron su nivel mínimo.',
          labels: lowInventory.map((product: any) =>
            localizeReportText(product.name || 'Producto sin nombre')
          ),
          values: lowInventory.map(
            (product: any) => Number(product.currentStock) || 0
          ),
        }),
        variant: 'bars',
      };
    }
    return distributionChart(
      'Productos por categoría',
      'Proporción de productos activos en cada categoría del inventario.',
      activeInventory,
      'category'
    );
  }

  if (reportType === 'prescriptions') {
    return /(por fecha|por mes)/.test(primaryTitle)
      ? distributionChart(
          'Recetas por estado',
          'Proporción de recetas médicas según su estado.',
          data.prescriptions,
          'status'
        )
      : temporalChart(
          'Tendencia de recetas por fecha',
          'Evolución de las recetas médicas emitidas en cada fecha.',
          data.prescriptions,
          'date'
        );
  }

  if (reportType === 'vaccinations') {
    return primaryTitle.includes('vacuna')
      ? distributionChart(
          'Esquemas de vacunación por estado',
          'Proporción de esquemas según su estado actual.',
          data.vaccinations,
          'status'
        )
      : distributionChart(
          'Esquemas por vacuna',
          'Cantidad de esquemas registrados para cada vacuna.',
          data.vaccinations,
          'vaccine'
        );
  }

  if (reportType === 'treatments') {
    return /(por fecha|por mes)/.test(primaryTitle)
      ? distributionChart(
          'Tratamientos y servicios por estado',
          'Proporción de registros clínicos según su estado.',
          data.treatments,
          'status'
        )
      : temporalChart(
          'Tendencia de tratamientos y servicios',
          'Evolución de los registros clínicos agrupados por fecha.',
          data.treatments,
          'requestDate'
        );
  }

  const metrics = generateSystemMetrics(data);
  return {
    title: 'Alertas operativas actuales',
    description:
      'Comparación de las alertas que requieren seguimiento en los distintos módulos.',
    labels: [
      'Existencias bajas',
      'Productos agotados',
      'Citas pendientes',
      'Peluquería y aseo pendiente',
      'Vacunaciones vencidas',
      'Tratamientos activos',
    ],
    values: [
      metrics.inventory.lowStock,
      metrics.inventory.outOfStock,
      countMatchingDistribution(metrics.appointmentsByStatus, 'pendiente'),
      countMatchingDistribution(metrics.groomingByStatus, 'pendiente'),
      data.vaccinations.filter((vaccination: any) =>
        normalizeReportText(vaccination.status).includes('vencida')
      ).length,
      data.treatments.filter((treatment: any) =>
        normalizeReportText(treatment.status).includes('activo')
      ).length,
    ],
    variant: 'donut',
  };
}

function countByComputedValue(
  items: any[],
  getValue: (item: any) => string
) {
  return items.reduce((acc: Record<string, number>, item) => {
    const value = getValue(item) || 'Sin especificar';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function chartFromCounts(
  title: string,
  description: string,
  counts: Record<string, number>,
  sortLabels = false
) {
  const entries = Object.entries(counts);
  if (sortLabels) entries.sort(([left], [right]) => left.localeCompare(right));
  return normalizeChart({
    title,
    description,
    labels: entries.map(([label]) => label),
    values: entries.map(([, value]) => value),
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

type ReportBlock =
  | { type: 'heading'; text: string; number?: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; text: string; number: string }
  | { type: 'meta'; text: string };

function cleanReportLine(value: string) {
  const cleaned = localizeReportText(value)
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

function stripHiddenReasoning(value: unknown) {
  let content = typeof value === 'string' ? value : '';
  content = content.replace(
    /<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );
  content = content.replace(/^[\s\S]*?<\/(?:think|analysis|reasoning)>/i, '');
  content = content.replace(
    /<(?:think|analysis|reasoning)\b[^>]*>[\s\S]*$/i,
    ''
  );
  return content;
}

function stripReportMarkdown(content: string, reportTitle?: string) {
  return stripHiddenReasoning(content)
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
  const lines = stripHiddenReasoning(content).split(/\r?\n/);

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
      /^(?:([1-5])[\).:-]?\s*)?(Resumen(?: ejecutivo)?|Datos relevantes|Hallazgos clave|Alertas(?: que requieren atenci[oó]n)?|Riesgos o alertas|Acciones sugeridas|Recomendaciones|Conclusi[oó]n)\s*:?\s*(.*)$/i
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
              className="flex items-center gap-2 mt-5 first:mt-0 mb-3 rounded-xl bg-[#3D2E1F] px-3 py-2.5 shadow-sm"
            >
              {block.number && (
                <span className="w-6 h-6 rounded-full bg-[#F7EFE6] text-[#3D2E1F] text-xs font-bold flex items-center justify-center shrink-0">
                  {block.number}
                </span>
              )}
              <h4 className="font-bold text-[#F7EFE6] capitalize">
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
  const chartPoints = chart.labels.map((label, index) => ({
    label,
    value: chart.values[index] || 0,
  }));
  const chartColors = REPORT_CHART_COLORS;
  const totalValue = chartPoints.reduce(
    (total, point) => total + Number(point.value || 0),
    0
  );
  let accumulatedPercentage = 0;
  const donutSegments = chartPoints.map((point, index) => {
    const start = accumulatedPercentage;
    accumulatedPercentage +=
      totalValue > 0 ? (Number(point.value || 0) / totalValue) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${accumulatedPercentage}%`;
  });
  const lineChartWidth = 360;
  const lineChartHeight = 190;
  const linePadding = { top: 14, right: 14, bottom: 36, left: 30 };
  const linePoints = chartPoints.map((point, index) => {
    const availableWidth =
      lineChartWidth - linePadding.left - linePadding.right;
    const availableHeight =
      lineChartHeight - linePadding.top - linePadding.bottom;
    const x =
      chartPoints.length <= 1
        ? linePadding.left + availableWidth / 2
        : linePadding.left + (index / (chartPoints.length - 1)) * availableWidth;
    const y =
      linePadding.top +
      availableHeight -
      (Number(point.value || 0) / maxValue) * availableHeight;
    return { ...point, x, y };
  });

  return (
    <div className="bg-muted border border-border rounded-2xl p-3 md:p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3 rounded-xl bg-[#3D2E1F] px-3 py-2.5 shadow-sm">
        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-[#F7EFE6] shrink-0" />

        <h3 className="text-[#F7EFE6] font-semibold text-sm sm:text-base truncate">
          {chart.title}
        </h3>
      </div>

      <p className="text-muted-foreground text-[11px] sm:text-xs mb-4">
        {chart.description}
      </p>

      {chart.variant === 'donut' ? (
        <div>
          <div
            className="mx-auto mb-4 flex h-40 w-40 items-center justify-center rounded-full"
            style={{
              background:
                totalValue > 0
                  ? `conic-gradient(${donutSegments.join(', ')})`
                  : '#D8D2C8',
            }}
            role="img"
            aria-label={`${chart.title}. Total: ${totalValue}`}
          >
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-border bg-card shadow-inner">
              <span className="text-2xl font-black text-foreground">
                {totalValue}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {chartPoints.map((point, index) => (
              <div
                key={`${point.label}-legend-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: chartColors[index % chartColors.length],
                    }}
                  />
                  <span className="truncate">{point.label}</span>
                </span>
                <span className="shrink-0 font-bold text-primary">
                  {point.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : chart.variant === 'line' ? (
        <div className="w-full overflow-x-auto" aria-label={chart.title}>
          <svg
            viewBox={`0 0 ${lineChartWidth} ${lineChartHeight}`}
            className="h-64 min-w-[340px] w-full"
            role="img"
            aria-label={chart.description}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y =
                linePadding.top +
                ratio *
                  (lineChartHeight - linePadding.top - linePadding.bottom);
              const value = Math.round(maxValue * (1 - ratio));
              return (
                <g key={ratio}>
                  <line
                    x1={linePadding.left}
                    x2={lineChartWidth - linePadding.right}
                    y1={y}
                    y2={y}
                    stroke="#D8D2C8"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={linePadding.left - 7}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#6B6255"
                  >
                    {value}
                  </text>
                </g>
              );
            })}
            {linePoints.length > 1 && (
              <polyline
                points={linePoints.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke="#7B5B42"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {linePoints.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <circle cx={point.x} cy={point.y} r="4" fill="#C9965A">
                  <title>{`${point.label}: ${point.value}`}</title>
                </circle>
                {(chartPoints.length <= 6 ||
                  index === 0 ||
                  index === chartPoints.length - 1 ||
                  index % Math.ceil(chartPoints.length / 5) === 0) && (
                  <text
                    x={point.x}
                    y={lineChartHeight - 13}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#6B6255"
                  >
                    {formatChartAxisLabel(point.label)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      ) : (
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
      )}
    </div>
  );
}

function formatChartAxisLabel(value: string) {
  const label = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label.slice(5);
  if (/^\d{4}-\d{2}$/.test(label)) return label.slice(5);
  return label.length > 9 ? `${label.slice(0, 8)}…` : label;
}

function fitCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
) {
  const text = String(value || '');
  if (context.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (
    shortened.length > 1 &&
    context.measureText(`${shortened}…`).width > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function renderChartForPdf(chart: ChartData) {
  if (typeof document === 'undefined') return null;

  const width = 1400;
  const height = chart.variant === 'donut' ? 560 : 520;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);

  const points = chart.labels.map((label, index) => ({
    label,
    value: Math.max(0, Number(chart.values[index] || 0)),
  }));
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  if (chart.variant === 'donut') {
    const total = points.reduce((sum, point) => sum + point.value, 0);
    const centerX = 300;
    const centerY = height / 2;
    const radius = 155;
    const lineWidth = 92;

    context.lineWidth = lineWidth;
    context.lineCap = 'butt';

    if (total === 0) {
      context.beginPath();
      context.strokeStyle = '#D8D2C8';
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    } else {
      let startAngle = -Math.PI / 2;
      points.forEach((point, index) => {
        if (point.value <= 0) return;
        const endAngle =
          startAngle + (point.value / total) * Math.PI * 2;
        context.beginPath();
        context.strokeStyle =
          REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length];
        context.arc(centerX, centerY, radius, startAngle, endAngle);
        context.stroke();
        startAngle = endAngle;
      });
    }

    context.textAlign = 'center';
    context.fillStyle = '#3D2E1F';
    context.font = 'bold 54px Arial';
    context.fillText(String(total), centerX, centerY + 8);
    context.fillStyle = '#6B6255';
    context.font = 'bold 20px Arial';
    context.fillText('TOTAL', centerX, centerY + 42);

    const legendX = 610;
    const legendValueX = width - 70;
    const legendStartY = 65;
    const legendRowHeight = Math.min(58, 430 / Math.max(points.length, 1));

    context.textAlign = 'left';
    context.font = '26px Arial';
    points.forEach((point, index) => {
      const y = legendStartY + index * legendRowHeight;
      context.fillStyle =
        REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length];
      context.fillRect(legendX, y - 18, 24, 24);
      context.fillStyle = '#2F2924';
      context.fillText(
        fitCanvasText(context, point.label, 570),
        legendX + 42,
        y + 3
      );
      context.textAlign = 'right';
      context.font = 'bold 27px Arial';
      context.fillStyle = '#7B5B42';
      context.fillText(String(point.value), legendValueX, y + 3);
      context.textAlign = 'left';
      context.font = '26px Arial';
    });
  } else {
    const padding = { top: 42, right: 45, bottom: 88, left: 90 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    context.font = '20px Arial';
    context.lineWidth = 2;
    context.textAlign = 'right';
    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const y = padding.top + ratio * plotHeight;
      const value = Math.round(maxValue * (1 - ratio));
      context.beginPath();
      context.strokeStyle = '#D8D2C8';
      context.setLineDash([7, 8]);
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#6B6255';
      context.fillText(String(value), padding.left - 18, y + 7);
    }

    const linePoints = points.map((point, index) => ({
      ...point,
      x:
        points.length <= 1
          ? padding.left + plotWidth / 2
          : padding.left + (index / (points.length - 1)) * plotWidth,
      y: padding.top + plotHeight - (point.value / maxValue) * plotHeight,
    }));

    if (linePoints.length > 1) {
      context.beginPath();
      context.strokeStyle = '#7B5B42';
      context.lineWidth = 7;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      linePoints.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
    }

    linePoints.forEach((point, index) => {
      context.beginPath();
      context.fillStyle = '#C9965A';
      context.arc(point.x, point.y, 10, 0, Math.PI * 2);
      context.fill();

      context.textAlign = 'center';
      context.font = 'bold 20px Arial';
      context.fillStyle = '#3D2E1F';
      context.fillText(String(point.value), point.x, Math.max(25, point.y - 18));

      if (
        points.length <= 6 ||
        index === 0 ||
        index === points.length - 1 ||
        index % Math.ceil(points.length / 5) === 0
      ) {
        context.font = '19px Arial';
        context.fillStyle = '#6B6255';
        context.fillText(
          formatChartAxisLabel(point.label),
          point.x,
          height - 42
        );
      }
    });
  }

  return canvas.toDataURL('image/png');
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
