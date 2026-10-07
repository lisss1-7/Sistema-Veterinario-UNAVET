const {
  REPORT_TITLES,
  VALID_REPORT_TYPES,
  buildFallbackReport,
  buildSafeMetricContext,
  buildSystemPrompt,
  buildUserPrompt,
  normalizeProviderReport,
} = require('../utils/aiReportContent');

const DEFAULT_PROVIDER = String(process.env.AI_PROVIDER || 'auto').toLowerCase();
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
const PROVIDER_TIMEOUT_MS = 25_000;

const REQUIRED_METRIC_KEYS = {
  general: ['totals', 'operationalAlerts'],
  patients: ['totalPatients', 'patientsBySpecies'],
  appointments: ['totalAppointments', 'appointmentsByStatus'],
  grooming: ['totalGroomingServices', 'groomingByStatus'],
  inventory: ['totalProducts', 'lowStockCount', 'outOfStockCount'],
  prescriptions: ['totalPrescriptions', 'prescriptionsByStatus'],
  vaccinations: ['totalVaccinationSchedules', 'vaccinationsByStatus'],
  treatments: ['totalTreatmentsAndServices', 'treatmentsByStatus'],
};

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseProviderResponse = async (response, providerName) => {
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`${providerName} respondió ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const finishReason = data?.choices?.[0]?.finish_reason;
  if (finishReason === 'length' || finishReason === 'content_filter') {
    throw new Error(
      `${providerName} devolvió una respuesta incompleta (${finishReason})`
    );
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${providerName} no devolvió contenido`);
  }
  return content.trim();
};

const callOpenRouter = async (messages) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
      }),
    }
  );

  return parseProviderResponse(response, 'OpenRouter');
};

const callOpenAI = async (messages) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
      }),
    }
  );

  return parseProviderResponse(response, 'OpenAI');
};

const callGroq = async (messages) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada');

  const isQwenReasoningModel = /^qwen\/qwen3\.(?:6|8)-/i.test(GROQ_MODEL);
  const providerMessages = isQwenReasoningModel
    ? [
        {
          role: 'user',
          content: messages.map((message) => message.content).join('\n\n'),
        },
      ]
    : messages;
  const requestBody = {
    model: GROQ_MODEL,
    messages: providerMessages,
    temperature: isQwenReasoningModel ? 0.5 : 0.2,
    max_completion_tokens: 1200,
  };

  if (isQwenReasoningModel) {
    requestBody.reasoning_format = 'hidden';
    requestBody.reasoning_effort = 'none';
    requestBody.top_p = 0.95;
  }

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  return parseProviderResponse(response, 'Groq');
};

const resolveProviderOrder = () => {
  if (DEFAULT_PROVIDER === 'auto') return ['openai', 'openrouter', 'groq'];
  return [DEFAULT_PROVIDER];
};

const executeProvider = async (provider, messages) => {
  if (provider === 'openai') return callOpenAI(messages);
  if (provider === 'openrouter') return callOpenRouter(messages);
  if (provider === 'groq') return callGroq(messages);
  throw new Error(`Proveedor no soportado: ${provider}`);
};

const hasRequiredMetrics = (reportType, metrics) =>
  REQUIRED_METRIC_KEYS[reportType].every((key) =>
    Object.prototype.hasOwnProperty.call(metrics, key)
  );

const generarReporteIA = async (req, res) => {
  try {
    const { prompt, reportType = 'general', metrics } = req.body;
    const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';

    if (!cleanPrompt) {
      return res.status(400).json({
        message: 'Escribe qué reporte deseas generar.',
      });
    }
    if (cleanPrompt.length > 500) {
      return res.status(400).json({
        message: 'La solicitud del reporte no puede superar 500 caracteres.',
      });
    }
    if (!VALID_REPORT_TYPES.has(reportType)) {
      return res.status(400).json({
        message: 'El tipo de reporte no es válido.',
      });
    }
    if (
      !metrics ||
      typeof metrics !== 'object' ||
      Array.isArray(metrics) ||
      !hasRequiredMetrics(reportType, metrics)
    ) {
      return res.status(400).json({
        message:
          'Los datos necesarios para generar el reporte están incompletos. Actualiza la página e inténtalo de nuevo.',
      });
    }

    const reportTitle = REPORT_TITLES[reportType];
    const requestScope = (Array.isArray(metrics.requestScope) ? metrics.requestScope : [])
      .filter((value) => typeof value === 'string')
      .slice(0, 12)
      .map((value) => value.replace(/[\r\n]/g, ' ').slice(0, 150));
    const safeMetrics = {
      ...buildSafeMetricContext(reportType, metrics),
      ...(requestScope.length ? { alcanceSolicitado: requestScope } : {}),
    };
    const fallbackContent = buildFallbackReport(
      reportType,
      metrics,
      cleanPrompt
    ).replace('1) Resumen\n', requestScope.length
      ? `1) Resumen\nAlcance del reporte: ${requestScope.join('; ')}.\n\n`
      : '1) Resumen\n');
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      {
        role: 'user',
        content: buildUserPrompt(
          cleanPrompt,
          reportType,
          reportTitle,
          safeMetrics
        ),
      },
    ];

    let content = fallbackContent;
    let providerUsed = 'datos-del-sistema';
    const providerErrors = [];

    for (const provider of resolveProviderOrder()) {
      try {
        const providerContent = await executeProvider(provider, messages);
        const validatedContent = normalizeProviderReport(
          providerContent,
          safeMetrics,
          reportType
        );
        if (!validatedContent) {
          throw new Error(
            'la respuesta no cumplió los controles de idioma, estructura o cifras'
          );
        }
        content = validatedContent;
        providerUsed = provider;
        break;
      } catch (error) {
        providerErrors.push(`${provider}: ${error.message}`);
      }
    }

    if (providerUsed === 'datos-del-sistema' && providerErrors.length > 0) {
      console.warn(
        `Reporte generado con datos del sistema. Proveedores descartados: ${providerErrors.join(' | ')}`
      );
    }

    return res.json({
      content,
      providerUsed,
      reportType,
      reportTitle,
      validated: true,
    });
  } catch (error) {
    console.error('Error al generar el reporte:', error);
    return res.status(500).json({
      message: 'No se pudo generar el reporte. Inténtalo de nuevo.',
    });
  }
};

module.exports = {
  generarReporteIA,
};
