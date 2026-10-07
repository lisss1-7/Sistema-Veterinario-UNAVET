export type ReportType = 'general' | 'patients' | 'appointments' | 'grooming' | 'inventory' | 'prescriptions' | 'vaccinations' | 'treatments';
type DataModule = Exclude<ReportType, 'general'>;
type ReportRecord = Record<string, unknown>;

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function detectReportType(prompt: string): ReportType | null {
  const text = normalize(prompt);
  if (/\b(?:compara|comparar|comparacion|relaciona)\b/.test(text)) {
    const modules = [/\bcitas?\b/, /\b(?:grooming|peluqueria|aseo)\b/, /\b(?:vacun\w*|inmuniz\w*)\b/, /\b(?:inventario|existencias|productos)\b/, /\brecetas?\b/, /\btratamientos?\b/, /\bpacientes?\b/];
    if (modules.filter((pattern) => pattern.test(text)).length > 1) return 'general';
  }
  if (/\b(?:reporte|resumen|informe|analisis)\s+general\b|\b(?:resumen|informe|reporte) (?:del sistema|de la clinica)\b/.test(text)) return 'general';
  // Los módulos específicos tienen prioridad sobre referencias a sus pacientes o productos.
  if (/\b(?:recetas?|prescripciones?)\b/.test(text)) return 'prescriptions';
  if (/\b(?:inventario|stock|existencias?|productos?|agotados?|reposicion|reponer)\b/.test(text)) return 'inventory';
  if (/\b(?:vacun\w*|inmuniz\w*|dosis)\b/.test(text)) return 'vaccinations';
  if (/\b(?:grooming|peluqueria|estetica|aseo|banos?|transporte)\b/.test(text)) return 'grooming';
  if (/\b(?:citas?|agenda|agendad\w*)\b/.test(text)) return 'appointments';
  if (/\b(?:tratamientos?|laboratorio|pruebas?|servicios? clinicos?)\b/.test(text)) return 'treatments';
  if (/\b(?:pacientes?|mascotas?|especies?|razas?|perros?|gatos?|canin\w*|felin\w*)\b/.test(text)) return 'patients';
  if (/\bmedicamentos?\b/.test(text)) return 'prescriptions';
  return null;
}

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function requestedPeriod(text: string, now: Date): [string, string] | null {
  const dates = [...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g)].map(([value]) => {
    if (/^\d{4}-/.test(value)) return value;
    const [day, month, year] = value.split(/[/-]/);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  });
  if (dates.some((value) => Number.isNaN(Date.parse(value)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)) {
    throw new Error('La solicitud contiene una fecha inválida. Usa el formato día/mes/año.');
  }
  if (dates.length > 2) throw new Error('Indica una fecha o un rango de dos fechas para el reporte.');
  if (dates.length === 2) {
    if (dates[0] > dates[1]) throw new Error('La fecha inicial debe ser anterior o igual a la fecha final.');
    return [dates[0], dates[1]];
  }
  if (dates.length === 1) {
    if (/\bdesde\b/.test(text)) return [dates[0], '9999-12-31'];
    if (/\bhasta\b/.test(text)) return ['0001-01-01', dates[0]];
    return [dates[0], dates[0]];
  }
  if (/\b(?:hoy|ayer|manana)\b/.test(text)) {
    const day = new Date(now);
    day.setDate(day.getDate() + (/\bayer\b/.test(text) ? -1 : /\bmanana\b/.test(text) ? 1 : 0));
    return [dateKey(day), dateKey(day)];
  }
  const namedMonth = MONTHS.findIndex((month) => new RegExp(`\\b${month}\\b`).test(text));
  const relativeMonth = /\b(?:este|del|el|ultimo) mes\b|\bmes (?:actual|pasado|anterior)\b/.test(text);
  if (namedMonth >= 0 || relativeMonth) {
    const year = Number(text.match(/\b(?:19|20)\d{2}\b/)?.[0] || now.getFullYear());
    const month = namedMonth >= 0 ? namedMonth : now.getMonth() - (/mes (?:pasado|anterior)|ultimo mes/.test(text) ? 1 : 0);
    return [dateKey(new Date(year, month, 1)), dateKey(new Date(year, month + 1, 0))];
  }
  if (/\b(?:esta semana|semana actual|semana pasada)\b/.test(text)) {
    const start = new Date(now);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7 - (/semana pasada/.test(text) ? 7 : 0));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [dateKey(start), dateKey(end)];
  }
  const days = text.match(/\b(ultimos|proximos) (\d+) dias\b/);
  if (days) {
    const count = Number(days[2]);
    if (count < 1 || count > 3660) throw new Error('Indica un periodo entre 1 y 3660 días.');
    const other = new Date(now);
    other.setDate(other.getDate() + (days[1] === 'ultimos' ? -1 : 1) * (count - 1));
    return days[1] === 'ultimos' ? [dateKey(other), dateKey(now)] : [dateKey(now), dateKey(other)];
  }
  return null;
}

const DATE_FIELDS: Record<DataModule, string> = {
  patients: 'registrationDate', appointments: 'date', grooming: 'date', inventory: 'expirationDate',
  prescriptions: 'date', vaccinations: 'applicationDate', treatments: 'requestDate',
};

// Reconoce valores del catálogo recibido de la API, sin sustituirlo por opciones fijas.
function mentionedValues(text: string, records: ReportRecord[], field: string) {
  const values = [...new Set(records.map((record) => String(record[field] || '')).filter(Boolean))];
  return values.filter((value) => {
    const normalized = normalize(value);
    const stem = normalized.replace(/(?:os|as|o|a|s)$/, '');
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text) || (stem.length >= 4 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*\\b`).test(text));
  });
}

export function filterReportData<T extends Record<DataModule, ReportRecord[]>>(
  prompt: string, reportType: ReportType, data: T, now = new Date()
): { data: T; scope: string[] } {
  if (reportType === 'general') return { data, scope: [] };
  const text = normalize(prompt);
  const records = data[reportType];
  const conditions: Array<(record: ReportRecord) => boolean> = [];
  const scope: string[] = [];
  const period = requestedPeriod(text, now);
  if (period) {
    if (reportType === 'inventory' && !/venc|caduc/.test(text)) {
      throw new Error('El inventario disponible permite filtrar por fecha de vencimiento. Indica si deseas analizar vencimientos.');
    }
    const field = reportType === 'vaccinations' && /pendient|proxim|venc/.test(text) ? 'nextDose' : DATE_FIELDS[reportType];
    conditions.push((record) => {
      const value = String(record[field] || '').slice(0, 10);
      return Boolean(value) && value >= period[0] && value <= period[1];
    });
    scope.push(`${field === 'registrationDate' ? 'Fecha de registro' : field === 'expirationDate' ? 'Vencimiento' : field === 'nextDose' ? 'Próxima dosis' : 'Fecha'}: ${period[0]} a ${period[1]}`);
  }
  const states = mentionedValues(text, records, 'status');
  const requestedStates = [...text.matchAll(/\b(?:(no|sin|excepto|excluir|excluyendo)\s+)?(pendient|confirmad|cancelad|completad|anulad|vencid|inactiv|activ)[a-z]*\b/g)];
  if (requestedStates.length && reportType !== 'patients') {
    conditions.push((record) => {
      const matches = (match: RegExpMatchArray) => reportType === 'vaccinations' && match[2] === 'pendient'
        ? !normalize(record.status).includes('complet') : normalize(record.status).startsWith(match[2]);
      const included = requestedStates.filter((match) => !match[1]);
      return requestedStates.filter((match) => match[1]).every((match) => !matches(match)) && (!included.length || included.some(matches));
    });
    scope.push(`Estado solicitado: ${requestedStates.map(([word]) => word).join(', ')}`);
  } else if (states.length && !/\bpor estado\b/.test(text)) {
    conditions.push((record) => states.includes(String(record.status)));
    scope.push(`Estado: ${states.join(', ')}`);
  } else if (reportType === 'vaccinations' && /\bpendientes?\b/.test(text)) {
    conditions.push((record) => !normalize(record.status).includes('complet'));
    scope.push('Esquemas pendientes');
  }
  const fields = reportType === 'patients' ? ['species', 'breed', 'sex', 'reproductiveStatus']
    : reportType === 'inventory' ? ['category'] : reportType === 'vaccinations' ? ['vaccine']
    : reportType === 'grooming' ? ['type'] : reportType === 'treatments' ? ['type', 'category'] : [];
  for (const field of fields) {
    let values = mentionedValues(text, records, field);
    if ((field === 'type' || field === 'category') && !/\b(?:solo|unicamente|tipo|modalidad|transporte|laboratorio|pruebas?)\b/.test(text)) {
      values = values.filter((value) => !/^(?:tratamientos?|servicios?|peluqueria y aseo)$/.test(normalize(value)));
    }
    if (field === 'species') {
      values = [...new Set([...values, ...records.map((record) => String(record.species || '')).filter((value) =>
        /\bperros?\b/.test(text) && /canin|perro/.test(normalize(value)) || /\bgatos?\b/.test(text) && /felin|gato/.test(normalize(value))
      )])];
      if (!values.length && /\b(?:perros?|gatos?|canin\w*|felin\w*)\b/.test(text)) {
        conditions.push(() => false);
        scope.push('Especie solicitada sin coincidencias');
      }
    }
    if (values.length) {
      conditions.push((record) => values.includes(String(record[field])));
      scope.push(`Filtro: ${values.join(', ')}`);
    }
  }
  const nameField = reportType === 'inventory' ? 'name' : 'petName';
  const names = mentionedValues(text, records, nameField).filter((name) => normalize(name).length >= 3);
  if (names.length) {
    conditions.push((record) => names.includes(String(record[nameField])));
    scope.push(`Nombre: ${names.join(', ')}`);
  }
  if (reportType === 'patients' && /sin (?:una )?(?:visita|consulta)/.test(text)) {
    conditions.push((record) => !record.lastVisit);
    scope.push('Sin visita registrada');
  }
  if (reportType === 'inventory' && /\bagotad\w*\b|sin existencias|sin stock/.test(text)) {
    conditions.push((record) => Number(record.currentStock) === 0);
    scope.push('Productos agotados');
  } else if (reportType === 'inventory' && /(?:existencias|stock) baj|baj[oa]s? (?:existencias|stock)/.test(text)) {
    conditions.push((record) => Number(record.currentStock) <= Number(record.minStock));
    scope.push('Existencias en el mínimo o por debajo');
  }
  return { data: { ...data, [reportType]: records.filter((record) => conditions.every((condition) => condition(record))) }, scope };
}
