const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'auto';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const REPORT_TITLES = {
  general: 'Reporte general del sistema',
  patients: 'Reporte de pacientes',
  appointments: 'Reporte de citas clínicas',
  grooming: 'Reporte de grooming',
  inventory: 'Reporte de inventario',
  prescriptions: 'Reporte de recetas médicas',
  vaccinations: 'Reporte de vacunación',
  treatments: 'Reporte de tratamientos y servicios',
};

const VALID_REPORT_TYPES = new Set(Object.keys(REPORT_TITLES));

const buildSystemPrompt = () => {
  return [
    'Eres un asistente de analitica para una clinica veterinaria llamada UNAVET.',
    'Responde SIEMPRE en espanol claro y profesional.',
    'Genera reportes accionables, con hallazgos y recomendaciones concretas.',
    'No inventes datos: usa unicamente los datos enviados en el contexto.',
    'Si faltan datos, dilo explicitamente.',
    'Evita recomendaciones medicas clinicas no solicitadas; enfocate en gestion y operacion.',
    'Entrega texto limpio y profesional. No uses Markdown ni caracteres de formato como asteriscos, numerales, guiones bajos o bloques de codigo.',
  ].join(' ');
};

const buildUserPrompt = (prompt, reportType, reportTitle, metrics, chart) => {
  const payload = {
    solicitudUsuario: prompt,
    tipoReporte: reportType,
    tituloReporte: reportTitle,
    metricasExclusivasDelReporte: metrics,
    grafica: chart,
  };

  return [
    `Genera un reporte breve y estructurado exclusivamente sobre: ${reportTitle}.`,
    reportType === 'general'
      ? 'Este es un reporte general: puedes comparar los módulos incluidos en las métricas.'
      : 'No menciones, resumas ni recomiendes acciones de otros módulos. Usa únicamente las métricas específicas enviadas.',
    'Cada cifra y recomendación debe estar directamente relacionada con el tipo de reporte solicitado.',
    'Escribe los nombres de las secciones como texto normal, sin asteriscos, numerales ni sintaxis Markdown.',
    'Usa este formato exacto de secciones:',
    '1) Resumen ejecutivo',
    '2) Hallazgos clave',
    '3) Riesgos o alertas',
    '4) Recomendaciones',
    '5) Conclusion',
    'Datos disponibles:',
    JSON.stringify(payload),
  ].join('\n');
};

const formatDistribution = (values = {}) => {
  const entries = Object.entries(values);
  return entries.length > 0
    ? entries.map(([label, value]) => `${label}: ${value}`).join(', ')
    : 'Sin datos registrados';
};

const buildReportSections = ({
  title,
  prompt,
  summary,
  findings,
  alerts,
  recommendations,
  conclusion,
  chart,
}) => {
  const chartLines = (chart?.labels || [])
    .map((label, index) => `- ${label}: ${chart?.values?.[index] ?? 0}`)
    .join('\n');

  return [
    title,
    `Solicitud: ${prompt}`,
    '',
    '1) Resumen ejecutivo',
    summary,
    '',
    '2) Hallazgos clave',
    ...findings.map((item) => `- ${item}`),
    '',
    `Datos representados en ${chart?.title || 'la gráfica'}:`,
    chartLines || '- Sin datos para representar.',
    '',
    '3) Riesgos o alertas',
    ...(alerts.length > 0
      ? alerts.map((item) => `- ${item}`)
      : ['- No se detectaron alertas operativas en este módulo.']),
    '',
    '4) Recomendaciones',
    ...recommendations.map((item, index) => `${index + 1}. ${item}`),
    '',
    '5) Conclusión',
    conclusion,
  ].join('\n');
};

const buildFallbackReport = (prompt, reportType, reportTitle, metrics, chart) => {
  const common = { title: reportTitle, prompt, chart };

  if (reportType === 'patients') {
    return buildReportSections({
      ...common,
      summary: `Hay ${metrics.totalPatients || 0} paciente(s) activo(s) registrados.`,
      findings: [
        `Por especie: ${formatDistribution(metrics.patientsBySpecies)}.`,
        `Por sexo: ${formatDistribution(metrics.patientsBySex)}.`,
        `Por estado reproductivo: ${formatDistribution(metrics.patientsByReproductiveStatus)}.`,
      ],
      alerts:
        metrics.patientsWithoutRecordedVisit > 0
          ? [`${metrics.patientsWithoutRecordedVisit} paciente(s) no tienen última visita registrada.`]
          : [],
      recommendations: [
        'Dar seguimiento a los pacientes sin visita registrada.',
        'Usar la distribución por especie y raza para planificar la atención.',
      ],
      conclusion:
        'El reporte refleja exclusivamente la composición y el seguimiento administrativo de los pacientes.',
    });
  }

  if (reportType === 'appointments') {
    const upcoming = (metrics.upcomingAppointments || [])
      .slice(0, 5)
      .map((item) => `${item.date} ${item.time}, ${item.patient} (${item.status})`)
      .join('; ');
    const pending = metrics.appointmentsByStatus?.Pendiente || 0;
    return buildReportSections({
      ...common,
      summary: `Se registran ${metrics.totalAppointments || 0} cita(s); ${metrics.appointmentsToday || 0} corresponden a hoy y ${metrics.upcomingAppointmentsCount || 0} están programadas desde hoy.`,
      findings: [
        `Por estado: ${formatDistribution(metrics.appointmentsByStatus)}.`,
        `Próximas citas: ${upcoming || 'No hay citas próximas'}.`,
      ],
      alerts:
        pending > 0
          ? [`Hay ${pending} cita(s) pendientes de confirmación o seguimiento.`]
          : [],
      recommendations: [
        'Confirmar las citas pendientes con sus tutores.',
        'Revisar las fechas con mayor carga en la agenda.',
      ],
      conclusion:
        'La agenda clínica debe gestionarse priorizando las citas pendientes y próximas.',
    });
  }

  if (reportType === 'grooming') {
    const pending = metrics.groomingByStatus?.Pendiente || 0;
    return buildReportSections({
      ...common,
      summary: `Se registran ${metrics.totalGroomingServices || 0} servicio(s), con ingresos estimados de Q${Number(metrics.estimatedIncome || 0).toFixed(2)}.`,
      findings: [
        `Por estado: ${formatDistribution(metrics.groomingByStatus)}.`,
        `Por tipo: ${formatDistribution(metrics.groomingByType)}.`,
        `${metrics.servicesWithTransport || 0} servicio(s) incluyen transporte y ${metrics.upcomingServicesCount || 0} están próximos.`,
      ],
      alerts:
        pending > 0 ? [`Hay ${pending} servicio(s) de grooming pendientes.`] : [],
      recommendations: [
        'Confirmar los servicios pendientes.',
        'Planificar capacidad y rutas para los servicios con transporte.',
      ],
      conclusion:
        'El reporte muestra exclusivamente la carga, modalidad e ingreso estimado del área de grooming.',
    });
  }

  if (reportType === 'inventory') {
    const lowStockList = (metrics.lowStockProducts || [])
      .slice(0, 10)
      .map((item) => `${item.name} (${item.currentStock}/${item.minStock})`)
      .join(', ');
    const alerts = [];
    if (metrics.outOfStockCount > 0) {
      alerts.push(`Hay ${metrics.outOfStockCount} producto(s) agotados.`);
    }
    if (metrics.lowStockCount > 0) {
      alerts.push(`Hay ${metrics.lowStockCount} producto(s) con stock mínimo o bajo.`);
    }
    if ((metrics.expiringWithin30Days || []).length > 0) {
      alerts.push(`${metrics.expiringWithin30Days.length} producto(s) vencen en los próximos 30 días.`);
    }
    return buildReportSections({
      ...common,
      summary: `Hay ${metrics.totalProducts || 0} producto(s) y ${metrics.totalUnits || 0} unidad(es), con valor de venta estimado de Q${Number(metrics.estimatedInventoryValue || 0).toFixed(2)}.`,
      findings: [
        `Por categoría: ${formatDistribution(metrics.inventoryByCategory)}.`,
        `Stock bajo: ${lowStockList || 'Ninguno'}.`,
      ],
      alerts,
      recommendations: [
        'Reponer primero los productos agotados y luego los de stock bajo.',
        'Dar salida prioritaria a productos próximos a vencer.',
      ],
      conclusion:
        'Las prioridades del inventario son la reposición de existencias y el control de vencimientos.',
    });
  }

  if (reportType === 'prescriptions') {
    return buildReportSections({
      ...common,
      summary: `Se registran ${metrics.totalPrescriptions || 0} receta(s); ${metrics.activePrescriptions || 0} están vigentes y reúnen ${metrics.totalMedicationLines || 0} línea(s) de medicamentos.`,
      findings: [
        `Por estado: ${formatDistribution(metrics.prescriptionsByStatus)}.`,
        `Por veterinario: ${formatDistribution(metrics.prescriptionsByVeterinarian)}.`,
        `Medicamentos indicados: ${formatDistribution(metrics.medicationsByName)}.`,
        `${metrics.medicationsFromInventory || 0} línea(s) fueron surtidas desde inventario.`,
      ],
      alerts: [],
      recommendations: [
        'Revisar que las recetas activas tengan indicaciones completas.',
        'Usar los medicamentos frecuentes para anticipar demanda.',
      ],
      conclusion:
        'El reporte resume únicamente la emisión y composición de las recetas médicas.',
    });
  }

  if (reportType === 'vaccinations') {
    const pending = (metrics.pendingVaccinations || [])
      .slice(0, 8)
      .map((item) => `${item.patient}, ${item.vaccine}, ${item.nextDose} (${item.status})`)
      .join('; ');
    return buildReportSections({
      ...common,
      summary: `Hay ${metrics.totalVaccinationSchedules || 0} esquema(s), con ${metrics.appliedDoses || 0} de ${metrics.scheduledDoses || 0} dosis aplicadas.`,
      findings: [
        `Por estado: ${formatDistribution(metrics.vaccinationsByStatus)}.`,
        `Por vacuna: ${formatDistribution(metrics.vaccinationsByVaccine)}.`,
        `Seguimientos pendientes: ${pending || 'Ninguno'}.`,
      ],
      alerts:
        metrics.overdueCount > 0
          ? [`Hay ${metrics.overdueCount} esquema(s) vencidos.`]
          : [],
      recommendations: [
        'Contactar a tutores con dosis vencidas o próximas.',
        'Actualizar cada esquema después de aplicar una dosis.',
      ],
      conclusion:
        'El seguimiento debe concentrarse en los esquemas vencidos y las próximas dosis.',
    });
  }

  if (reportType === 'treatments') {
    return buildReportSections({
      ...common,
      summary: `Se registran ${metrics.totalTreatmentsAndServices || 0} tratamiento(s), prueba(s) o servicio(s) clínicos.`,
      findings: [
        `Por estado: ${formatDistribution(metrics.treatmentsByStatus)}.`,
        `Por tipo: ${formatDistribution(metrics.treatmentsByType)}.`,
        `Por categoría: ${formatDistribution(metrics.treatmentsByCategory)}.`,
      ],
      alerts:
        metrics.pendingOrActive > 0
          ? [`Hay ${metrics.pendingOrActive} registro(s) pendientes o activos.`]
          : [],
      recommendations: [
        'Priorizar los registros clínicos que siguen abiertos.',
        'Verificar responsable, resultado y estado de cada servicio.',
      ],
      conclusion:
        'El reporte se limita al avance y clasificación de tratamientos y servicios clínicos.',
    });
  }

  const alerts = metrics.operationalAlerts || {};
  return buildReportSections({
    ...common,
    summary: `El sistema registra ${metrics.totals?.patients || 0} paciente(s), ${metrics.totals?.appointments || 0} cita(s), ${metrics.totals?.grooming || 0} grooming, ${metrics.totals?.inventory || 0} producto(s), ${metrics.totals?.prescriptions || 0} receta(s), ${metrics.totals?.vaccinations || 0} esquema(s) y ${metrics.totals?.treatments || 0} tratamiento(s).`,
    findings: ['La gráfica compara los totales actuales de los módulos principales.'],
    alerts: [
      alerts.outOfStock > 0 ? `${alerts.outOfStock} producto(s) agotados.` : '',
      alerts.pendingAppointments > 0
        ? `${alerts.pendingAppointments} cita(s) pendientes.`
        : '',
      alerts.overdueVaccinations > 0
        ? `${alerts.overdueVaccinations} vacunación(es) vencidas.`
        : '',
    ].filter(Boolean),
    recommendations: [
      'Atender primero las alertas operativas.',
      'Abrir el reporte específico de cada módulo para revisar detalles.',
    ],
    conclusion:
      'Esta es una vista ejecutiva general; cada reporte por módulo presenta su análisis especializado.',
  });
};

const buildLegacyFallbackReport = (prompt, metrics, chart) => {
  const recommendations = [];

  if (metrics?.inventory?.lowStock > 0) {
    recommendations.push(
      `Hay ${metrics.inventory.lowStock} producto(s) con stock bajo. Conviene planificar reabastecimiento en esta semana.`
    );
  }

  if ((metrics?.appointmentsByStatus?.Pendiente || 0) > 0) {
    recommendations.push(
      `Existen ${metrics.appointmentsByStatus.Pendiente} cita(s) pendientes. Conviene confirmar asistencia para reducir ausencias.`
    );
  }

  if ((metrics?.groomingByStatus?.Pendiente || 0) > 0) {
    recommendations.push(
      `Hay ${metrics.groomingByStatus.Pendiente} servicio(s) de grooming pendiente(s). Revisa capacidad y horarios.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('No se detectan alertas criticas con los datos actuales.');
  }

  const labels = chart?.labels || [];
  const values = chart?.values || [];

  const chartLines = labels
    .map((label, index) => `- ${label}: ${values[index] ?? 0}`)
    .join('\n');

  return [
    '1) Resumen ejecutivo',
    `Solicitud: ${prompt}`,
    `Totales: pacientes ${metrics?.totals?.patients || 0}, citas ${metrics?.totals?.appointments || 0}, grooming ${metrics?.totals?.grooming || 0}, inventario ${metrics?.totals?.inventory || 0}, recetas ${metrics?.totals?.prescriptions || 0}, vacunaciones ${metrics?.totals?.vaccinations || 0}, tratamientos ${metrics?.totals?.treatments || 0}.`,
    '',
    '2) Hallazgos clave',
    `Grafica: ${chart?.title || 'Sin grafica'}`,
    chart?.description || 'Sin descripcion de grafica.',
    chartLines || '- Sin datos para representar.',
    '',
    '3) Riesgos o alertas',
    metrics?.inventory?.outOfStock > 0
      ? `- Hay ${metrics.inventory.outOfStock} producto(s) sin stock.`
      : '- No hay productos sin stock reportados.',
    '',
    '4) Recomendaciones',
    ...recommendations.map((item, index) => `${index + 1}. ${item}`),
    '',
    '5) Conclusion',
    'La informacion permite priorizar inventario, seguimiento de citas y carga operativa de manera inmediata.',
  ].join('\n');
};

const callOllama = async (messages) => {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.message?.content || '';
};

const callOpenRouter = async (messages) => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

const callOpenAI = async (messages) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

const callGroq = async (messages) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY no configurada');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

const resolveProviderOrder = () => {
  if (DEFAULT_PROVIDER === 'auto') {
    return ['openai', 'openrouter', 'groq', 'ollama'];
  }

  return [DEFAULT_PROVIDER];
};

const executeProvider = async (provider, messages) => {
  if (provider === 'openai') {
    return callOpenAI(messages);
  }

  if (provider === 'openrouter') {
    return callOpenRouter(messages);
  }

  if (provider === 'groq') {
    return callGroq(messages);
  }

  if (provider === 'ollama') {
    return callOllama(messages);
  }

  throw new Error(`Proveedor IA no soportado: ${provider}`);
};

const generarReporteIA = async (req, res) => {
  try {
    const {
      prompt,
      reportType = 'general',
      reportTitle,
      metrics,
      chart,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        message: 'El campo prompt es obligatorio',
      });
    }

    if (!VALID_REPORT_TYPES.has(reportType)) {
      return res.status(400).json({
        message: 'El tipo de reporte no es válido',
      });
    }

    const effectiveReportTitle =
      typeof reportTitle === 'string' && reportTitle.trim()
        ? reportTitle.trim()
        : REPORT_TITLES[reportType];

    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt(),
      },
      {
        role: 'user',
        content: buildUserPrompt(
          prompt,
          reportType,
          effectiveReportTitle,
          metrics || {},
          chart || {}
        ),
      },
    ];

    let content = '';
    let providerUsed = DEFAULT_PROVIDER;
    let fallbackUsed = false;
    const providerErrors = [];

    try {
      const providers = resolveProviderOrder();

      for (const provider of providers) {
        try {
          content = await executeProvider(provider, messages);
          providerUsed = provider;
          break;
        } catch (error) {
          providerErrors.push(`${provider}: ${error.message}`);
        }
      }

      if (!content) {
        throw new Error(
          providerErrors.length > 0
            ? providerErrors.join(' | ')
            : 'No se obtuvo respuesta de proveedores IA'
        );
      }
    } catch (providerError) {
      fallbackUsed = true;
      providerUsed = 'fallback-local';
      content = buildFallbackReport(
        prompt,
        reportType,
        effectiveReportTitle,
        metrics || {},
        chart || {}
      );

      console.error('Fallo proveedor IA, usando fallback local:', providerError.message);
    }

    return res.json({
      content,
      providerUsed,
      fallbackUsed,
      providerMode: DEFAULT_PROVIDER,
      reportType,
      reportTitle: effectiveReportTitle,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error al generar reporte IA',
      error: error.message,
    });
  }
};

module.exports = {
  generarReporteIA,
};
