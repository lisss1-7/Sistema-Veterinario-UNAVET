const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
  quiet: true,
});

const TABLE_COMMENTS = {
  archivos_adjuntos: 'Archivos adjuntos vinculados con registros clínicos y operativos del sistema.',
  auditoria: 'Bitácora de acciones realizadas por los usuarios sobre las entidades del sistema.',
  categorias_inventario: 'Catálogo de categorías utilizadas para clasificar productos de inventario.',
  categorias_servicio: 'Catálogo de categorías utilizadas para agrupar los servicios ofrecidos.',
  cierre_ventas_detalle: 'Detalle de productos y servicios incluidos en cada venta registrada.',
  cierres_ventas: 'Encabezados de ventas y totales recibidos por cada medio de pago.',
  citas_clinicas: 'Citas programadas para la atención clínica de pacientes veterinarios.',
  citas_grooming: 'Citas programadas para servicios de grooming y transporte asociado.',
  especies: 'Catálogo de especies animales admitidas para el registro de pacientes.',
  estados_cita: 'Catálogo normalizado de estados posibles para las citas clínicas.',
  estados_examen_fisico: 'Catálogo de estados utilizados en la evaluación del examen físico.',
  estados_grooming: 'Catálogo normalizado de estados posibles para las citas de grooming.',
  estados_producto: 'Catálogo normalizado de estados operativos de los productos de inventario.',
  estados_reproductivos: 'Catálogo de estados reproductivos disponibles para los pacientes.',
  estados_tratamiento: 'Catálogo normalizado de estados aplicables a tratamientos y servicios.',
  estados_usuario: 'Catálogo normalizado de estados de cuenta y acceso de los usuarios.',
  estados_vacunacion: 'Catálogo normalizado de estados del esquema de vacunación.',
  formas_pago: 'Catálogo de formas de pago aceptadas para registrar cobros de ventas.',
  historial_clinico: 'Expedientes de consultas, evaluaciones, diagnósticos y tratamientos clínicos.',
  horarios_atencion: 'Configuración de horarios, intervalos y capacidad de atención por módulo.',
  modos_entrega_receta: 'Catálogo de modalidades de entrega de medicamentos recetados.',
  modulos_sistema: 'Catálogo de módulos funcionales disponibles dentro del sistema.',
  movimientos_inventario: 'Bitácora de entradas, salidas y ajustes que modifican las existencias.',
  pacientes: 'Expedientes generales de las mascotas atendidas por la clínica veterinaria.',
  productos_inventario: 'Catálogo de productos, existencias, costos y precios del inventario.',
  proveedores: 'Directorio de proveedores asociados con los productos y compras de inventario.',
  pruebas_laboratorio: 'Catálogo de pruebas de laboratorio disponibles para la atención clínica.',
  razas: 'Catálogo de razas animales clasificadas por especie.',
  receta_medicamentos: 'Medicamentos, dosis e indicaciones que componen cada receta.',
  recetas: 'Recetas médicas emitidas para pacientes a partir de su atención clínica.',
  rol_permisos: 'Permisos de acceso y operación asignados a cada rol por módulo del sistema.',
  roles: 'Catálogo de roles que agrupan permisos y responsabilidades de los usuarios.',
  servicios: 'Catálogo de servicios clínicos, de grooming y operativos ofrecidos.',
  sexos: 'Catálogo normalizado de sexos disponibles para los pacientes.',
  tamanos_animales: 'Catálogo normalizado de tamaños utilizados para clasificar pacientes.',
  tipos_consulta: 'Catálogo normalizado de tipos de consulta clínica.',
  tipos_grooming: 'Catálogo normalizado de modalidades y tipos de servicio de grooming.',
  tipos_tratamiento: 'Catálogo normalizado de tipos de tratamiento, laboratorio y servicio.',
  tratamientos_servicios: 'Tratamientos, pruebas y servicios realizados o programados para pacientes.',
  tutores: 'Directorio de responsables o tutores de los pacientes veterinarios.',
  unidades_intervalo: 'Catálogo de unidades para expresar intervalos entre dosis de vacunas.',
  usuarios: 'Cuentas de usuario autorizadas para operar los módulos del sistema.',
  vacunaciones: 'Registro de vacunas aplicadas y próximas dosis programadas por paciente.',
  vacunas_catalogo: 'Catálogo de vacunas disponibles para registrar esquemas de vacunación.',
  venta_pagos: 'Desglose normalizado de los pagos asociados con cada venta.',
};

const ENTITY_LABELS = {
  archivos_adjuntos: 'archivo adjunto',
  auditoria: 'evento de auditoría',
  categorias_inventario: 'categoría de inventario',
  categorias_servicio: 'categoría de servicio',
  cierre_ventas_detalle: 'detalle de venta',
  cierres_ventas: 'venta',
  citas_clinicas: 'cita clínica',
  citas_grooming: 'cita de grooming',
  especies: 'especie',
  estados_cita: 'estado de cita',
  estados_examen_fisico: 'estado de examen físico',
  estados_grooming: 'estado de grooming',
  estados_producto: 'estado de producto',
  estados_reproductivos: 'estado reproductivo',
  estados_tratamiento: 'estado de tratamiento',
  estados_usuario: 'estado de usuario',
  estados_vacunacion: 'estado de vacunación',
  formas_pago: 'forma de pago',
  historial_clinico: 'registro de historial clínico',
  horarios_atencion: 'horario de atención',
  modos_entrega_receta: 'modo de entrega',
  modulos_sistema: 'módulo del sistema',
  movimientos_inventario: 'movimiento de inventario',
  pacientes: 'paciente',
  productos_inventario: 'producto de inventario',
  proveedores: 'proveedor',
  pruebas_laboratorio: 'prueba de laboratorio',
  razas: 'raza',
  receta_medicamentos: 'medicamento de receta',
  recetas: 'receta',
  rol_permisos: 'asignación de permisos',
  roles: 'rol',
  servicios: 'servicio',
  sexos: 'sexo',
  tamanos_animales: 'tamaño animal',
  tipos_consulta: 'tipo de consulta',
  tipos_grooming: 'tipo de grooming',
  tipos_tratamiento: 'tipo de tratamiento',
  tratamientos_servicios: 'tratamiento o servicio',
  tutores: 'tutor',
  unidades_intervalo: 'unidad de intervalo',
  usuarios: 'usuario',
  vacunaciones: 'registro de vacunación',
  vacunas_catalogo: 'vacuna de catálogo',
  venta_pagos: 'pago de venta',
};

const COMMON_COMMENTS = {
  accion: 'Acción ejecutada y registrada en la bitácora.',
  activo: 'Indica si el registro está habilitado para su uso.',
  actualizado_en: 'Fecha y hora de la última actualización del registro.',
  alimentacion: 'Descripción de la alimentación habitual del paciente.',
  cantidad: 'Cantidad de unidades involucradas en el registro.',
  capacidad_diaria: 'Cantidad máxima de atenciones permitidas durante el día.',
  categoria: 'Categoría descriptiva asignada al tratamiento o servicio.',
  cirugias_previas: 'Antecedentes de cirugías previas informados para el paciente.',
  cliente: 'Nombre del cliente asociado con la venta.',
  codigo: 'Código único utilizado para identificar el registro.',
  codigo_acceso: 'Código utilizado para consultar o gestionar la cita de grooming.',
  codigo_sku: 'Código SKU utilizado para identificar comercialmente el producto.',
  color: 'Color o patrón de pelaje del paciente.',
  conjuntiva: 'Resultado de la evaluación clínica de la conjuntiva.',
  consulta: 'Consulta o instrucción utilizada para generar el reporte.',
  controla_inventario: 'Indica si la prestación del servicio afecta existencias de inventario.',
  correo: 'Dirección de correo electrónico de contacto.',
  costo_grooming: 'Costo correspondiente al servicio de grooming.',
  costo_transporte: 'Costo correspondiente al transporte de la mascota.',
  creado_en: 'Fecha y hora de creación del registro.',
  descartada_en: 'Fecha y hora en que el usuario descartó la notificación.',
  descuenta_inventario: 'Indica si la entrega debe descontar unidades del inventario.',
  dia_semana: 'Número del día de la semana al que corresponde el horario.',
  diagnostico: 'Diagnóstico clínico asociado con la atención o receta.',
  dias_por_unidad: 'Cantidad equivalente de días por cada unidad de intervalo.',
  direccion: 'Dirección física de contacto registrada.',
  direccion_recogida: 'Dirección donde debe recogerse la mascota para el servicio.',
  dosis: 'Dosis indicada del medicamento.',
  dosis_aplicadas: 'Cantidad de dosis que ya fueron aplicadas al paciente.',
  dosis_totales: 'Cantidad total de dosis previstas en el esquema.',
  duracion: 'Duración indicada para administrar el medicamento.',
  edad: 'Edad informada para la mascota.',
  efectivo: 'Monto de la venta recibido en efectivo.',
  entidad: 'Nombre de la entidad del sistema sobre la que se actuó.',
  entidad_id: 'Identificador del registro de la entidad relacionada.',
  entidad_tipo: 'Tipo de entidad del sistema a la que pertenece el archivo.',
  es_aplicada: 'Indica si el estado representa una vacuna aplicada.',
  es_cancelado: 'Indica si el estado representa una cancelación.',
  es_completado: 'Indica si el estado representa una finalización.',
  es_inicial: 'Indica si este es el estado asignado inicialmente.',
  es_vencida: 'Indica si el estado representa una vacuna vencida.',
  especialidad: 'Especialidad profesional declarada por el usuario.',
  estado_clinico: 'Estado de avance del registro clínico.',
  estado_presentacion: 'Descripción del estado de presentación del tratamiento o servicio.',
  estado_reproductivo: 'Estado reproductivo del paciente según el valor original del registro.',
  expiracion: 'Fecha y hora límite de validez del token.',
  factura_nit: 'NIT utilizado para emitir la factura de la venta.',
  factura_nombre: 'Nombre o razón social utilizado para emitir la factura.',
  fecha_aplicacion: 'Fecha en que se aplicó la vacuna.',
  fecha_emision: 'Fecha en que se emitió la receta.',
  fecha_registro: 'Fecha de incorporación del paciente al sistema.',
  fecha_vencimiento: 'Fecha de vencimiento del producto, cuando aplica.',
  foto_adjunta: 'Imagen adjunta como evidencia del tratamiento, prueba o servicio.',
  foto_url: 'Ubicación o contenido codificado de la fotografía del paciente.',
  frecuencia: 'Frecuencia indicada para administrar el medicamento.',
  hora: 'Hora programada para la cita.',
  hora_fin: 'Hora en que finaliza el período de atención.',
  hora_inicio: 'Hora en que inicia el período de atención.',
  indicaciones: 'Indicaciones adicionales para administrar el medicamento.',
  intervalo: 'Cantidad de unidades entre una dosis y la siguiente.',
  intervalo_minutos: 'Duración en minutos de cada intervalo de atención.',
  ip: 'Dirección IP desde la que se realizó la acción.',
  lote: 'Número de lote de la vacuna aplicada.',
  masas_visibles: 'Hallazgos de masas visibles durante el examen clínico.',
  mensaje: 'Texto mostrado en la notificación.',
  meses_por_unidad: 'Cantidad equivalente de meses por cada unidad de intervalo.',
  modalidad: 'Modalidad de atención o transporte elegida para el grooming.',
  modalidad_legacy: 'Valor anterior conservado para compatibilidad con la modalidad original.',
  modo_entrega: 'Modalidad elegida para entregar u obtener el medicamento.',
  monto: 'Monto pagado mediante la forma de pago indicada.',
  motilidad: 'Resultado de la evaluación clínica de la motilidad.',
  motivo: 'Motivo que originó el registro o movimiento.',
  motivo_consulta: 'Motivo principal de la consulta clínica.',
  mucosa: 'Resultado de la evaluación clínica de las mucosas.',
  nombre_archivo: 'Nombre original del archivo adjunto.',
  nombre_mascota: 'Nombre de la mascota consignado al programar la cita.',
  nombre_medicamento: 'Nombre del medicamento indicado en la receta.',
  nombre_tutor: 'Nombre del tutor consignado al programar la cita.',
  nombre_vacuna: 'Nombre de la vacuna aplicada o programada.',
  notas: 'Notas adicionales relacionadas con la cita clínica.',
  observaciones: 'Observaciones adicionales relacionadas con el registro.',
  oidos: 'Resultado de la evaluación clínica de los oídos.',
  ojos: 'Resultado de la evaluación clínica de los ojos.',
  orden: 'Posición utilizada para ordenar el registro en la interfaz.',
  origen: 'Origen mediante el cual fue creado el registro clínico.',
  palpitaciones: 'Resultado de la evaluación clínica de las palpitaciones.',
  password_hash: 'Hash seguro de la contraseña del usuario.',
  pdf_url: 'Ubicación del archivo PDF generado para la receta.',
  permite_acceso: 'Indica si el estado permite iniciar sesión en el sistema.',
  precio: 'Precio total asignado a la cita de grooming.',
  precio_base: 'Precio base definido para el servicio.',
  precio_compra: 'Costo unitario de adquisición del producto.',
  precio_unitario: 'Precio aplicado por cada unidad del detalle.',
  precio_venta: 'Precio unitario de venta del producto.',
  proxima_dosis: 'Fecha programada para la siguiente dosis.',
  prurito: 'Resultado de la evaluación clínica de signos de prurito.',
  puede_crear: 'Indica si el rol puede crear registros en el módulo.',
  puede_editar: 'Indica si el rol puede modificar registros en el módulo.',
  puede_eliminar: 'Indica si el rol puede eliminar registros en el módulo.',
  puede_ver: 'Indica si el rol puede consultar el módulo.',
  raza: 'Raza de la mascota consignada al programar la cita.',
  referencia: 'Referencia o comprobante asociado con el pago.',
  referencia_id: 'Identificador del registro que originó el movimiento o notificación.',
  referencia_tipo: 'Tipo de operación o entidad que originó el movimiento.',
  requiere_proxima_dosis: 'Indica si el estado exige programar una dosis posterior.',
  requiere_transporte: 'Indica si el tipo de grooming incluye o requiere transporte.',
  respiratorio: 'Resultado de la evaluación clínica del sistema respiratorio.',
  resultado: 'Resultado obtenido o contenido generado para el registro.',
  ruta: 'Ruta de navegación asociada con el módulo.',
  ruta_archivo: 'Ruta de almacenamiento del archivo adjunto.',
  sexo: 'Sexo del paciente según el valor original del registro.',
  sin_existencias: 'Indica si el estado representa un producto sin existencias.',
  stock_actual: 'Cantidad disponible actualmente en inventario.',
  stock_anterior: 'Cantidad disponible antes del movimiento de inventario.',
  stock_minimo: 'Cantidad mínima que activa la alerta de existencias bajas.',
  stock_nuevo: 'Cantidad disponible después del movimiento de inventario.',
  subtotal: 'Importe resultante de multiplicar cantidad por precio unitario.',
  tamano_bytes: 'Tamaño del archivo expresado en bytes.',
  tamano_mascota: 'Clasificación de tamaño consignada para la mascota.',
  tarjeta_bac: 'Monto de la venta cobrado con tarjeta BAC.',
  tarjeta_bi: 'Monto de la venta cobrado con tarjeta BI.',
  telefono: 'Número telefónico de contacto.',
  telefono_tutor: 'Número telefónico del tutor consignado para la cita.',
  tipo_consulta: 'Tipo de consulta clínica consignado en el registro original.',
  tipo_mime: 'Tipo de contenido MIME del archivo adjunto.',
  tipo_movimiento: 'Clase de movimiento aplicado al inventario.',
  tipo_notificacion: 'Categoría funcional de la notificación.',
  tipo_reporte: 'Categoría del reporte generado.',
  tipo_servicio: 'Servicio de grooming solicitado en la cita.',
  token: 'Token único utilizado para autorizar el restablecimiento.',
  transferencia_ba: 'Monto de la venta recibido por transferencia BA.',
  transferencia_bi: 'Monto de la venta recibido por transferencia BI.',
  tratamiento: 'Tratamiento clínico indicado para el paciente.',
  ultima_visita: 'Fecha de la visita más reciente registrada para el paciente.',
  ultimo_acceso: 'Fecha y hora del acceso más reciente del usuario.',
  unidad_medida: 'Unidad utilizada para controlar las existencias del producto.',
  usado: 'Indica si el token ya fue utilizado.',
  valor_legacy: 'Valor anterior conservado para compatibilidad con datos existentes.',
  veterinario: 'Nombre del profesional veterinario responsable.',
};

const CONTEXT_COMMENTS = {
  'auditoria.descripcion': 'Descripción detallada de la acción auditada.',
  'categorias_inventario.descripcion': 'Descripción de la categoría de inventario.',
  'categorias_servicio.descripcion': 'Descripción de la categoría de servicio.',
  'cierre_ventas_detalle.cantidad': 'Cantidad vendida del producto o servicio.',
  'cierre_ventas_detalle.descripcion': 'Descripción del producto o servicio vendido.',
  'cierre_ventas_detalle.tipo': 'Indica si el detalle corresponde a un producto o servicio.',
  'cierres_ventas.fecha': 'Fecha contable en que se registró la venta.',
  'citas_clinicas.estado': 'Estado operativo original de la cita clínica.',
  'citas_clinicas.fecha': 'Fecha programada para la cita clínica.',
  'citas_grooming.estado': 'Estado operativo original de la cita de grooming.',
  'citas_grooming.fecha': 'Fecha programada para la cita de grooming.',
  'estados_producto.descripcion': 'Descripción del significado del estado de producto.',
  'estados_usuario.descripcion': 'Descripción del significado del estado de usuario.',
  'historial_clinico.fecha': 'Fecha en que se realizó o registró la atención clínica.',
  'modos_entrega_receta.descripcion': 'Descripción del modo de entrega del medicamento.',
  'movimientos_inventario.cantidad': 'Cantidad de unidades aplicadas por el movimiento.',
  'productos_inventario.descripcion': 'Descripción comercial o técnica del producto.',
  'productos_inventario.estado': 'Estado operativo original del producto.',
  'receta_medicamentos.cantidad': 'Cantidad de unidades indicadas o entregadas.',
  'recetas.estado': 'Estado de vigencia de la receta.',
  'roles.descripcion': 'Descripción de las responsabilidades asociadas con el rol.',
  'servicios.descripcion': 'Descripción del alcance del servicio.',
  'tratamientos_servicios.descripcion': 'Descripción detallada del tratamiento, prueba o servicio.',
  'tratamientos_servicios.estado': 'Estado operativo original del tratamiento o servicio.',
  'tratamientos_servicios.fecha': 'Fecha de realización o programación del tratamiento o servicio.',
  'tratamientos_servicios.tipo': 'Clasificación general como tratamiento, laboratorio o servicio.',
  'usuarios.estado': 'Estado original de activación de la cuenta de usuario.',
  'vacunaciones.estado': 'Estado operativo original de la vacunación.',
};

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function escapeLiteral(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeColumn(column) {
  const contextual = CONTEXT_COMMENTS[`${column.TABLE_NAME}.${column.COLUMN_NAME}`];
  if (contextual) return contextual;

  if (column.COLUMN_NAME === 'creado_por') {
    return 'Identificador del usuario que creó el registro.';
  }
  if (column.COLUMN_NAME === 'subido_por') {
    return 'Identificador del usuario que cargó el archivo.';
  }

  if (column.REFERENCED_TABLE_NAME) {
    const target = ENTITY_LABELS[column.REFERENCED_TABLE_NAME];
    if (!target) throw new Error(`No existe etiqueta para la tabla referenciada ${column.REFERENCED_TABLE_NAME}`);
    return `Identificador de ${target} relacionado con el registro.`;
  }

  const entity = ENTITY_LABELS[column.TABLE_NAME];
  if (!entity) throw new Error(`No existe etiqueta para la tabla ${column.TABLE_NAME}`);

  if (column.COLUMN_KEY === 'PRI') {
    return `Identificador único de ${entity}.`;
  }
  if (column.COLUMN_NAME === 'nombre') {
    return `Nombre de ${entity}.`;
  }
  if (column.COLUMN_NAME === 'descripcion') {
    return `Descripción complementaria de ${entity}.`;
  }

  const common = COMMON_COMMENTS[column.COLUMN_NAME];
  if (common) return common;

  throw new Error(`No se definió comentario para ${column.TABLE_NAME}.${column.COLUMN_NAME}`);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function collectStructuralSnapshot(connection, schema, tables) {
  const [columns] = await connection.query(
    `SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE,
            DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, CHARACTER_OCTET_LENGTH,
            NUMERIC_PRECISION, NUMERIC_SCALE, DATETIME_PRECISION,
            CHARACTER_SET_NAME, COLLATION_NAME, COLUMN_TYPE, COLUMN_KEY, EXTRA,
            PRIVILEGES, GENERATION_EXPRESSION, SRS_ID
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [schema],
  );
  const [indexes] = await connection.query(
    `SELECT TABLE_NAME, NON_UNIQUE, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME,
            COLLATION, SUB_PART, PACKED, NULLABLE, INDEX_TYPE, IS_VISIBLE,
            EXPRESSION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [schema],
  );
  const [constraints] = await connection.query(
    `SELECT tc.TABLE_NAME, tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE,
            kcu.ORDINAL_POSITION, kcu.COLUMN_NAME,
            kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
       FROM information_schema.TABLE_CONSTRAINTS tc
       LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
        AND kcu.TABLE_NAME = tc.TABLE_NAME
        AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_SCHEMA = ?
      ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    [schema],
  );
  const [foreignKeys] = await connection.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, UNIQUE_CONSTRAINT_NAME,
            MATCH_OPTION, UPDATE_RULE, DELETE_RULE
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ?
      ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
    [schema],
  );

  const rowCounts = [];
  for (const table of tables) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS total FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}`,
    );
    rowCounts.push({ table, total: String(row.total) });
  }

  return {
    structuralHash: stableHash({ columns, indexes, constraints, foreignKeys }),
    rowCountHash: stableHash(rowCounts),
    rowCounts,
  };
}

async function main() {
  const shouldApply = process.argv.includes('--apply');
  const schema = process.env.DB_NAME;
  if (!schema) throw new Error('Falta DB_NAME en backend/.env');

  const backupDir = path.join(__dirname, '../../backups');
  const backupPrefix = `${schema}_estructura_antes_comments_`;
  const backupExists = fs.existsSync(backupDir)
    && fs.readdirSync(backupDir).some((name) => name.startsWith(backupPrefix) && name.endsWith('.sql'));
  if (!backupExists) {
    throw new Error(`No se encontró el respaldo estructural previo requerido (${backupPrefix}*.sql)`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: schema,
    charset: 'utf8mb4',
  });

  try {
    const [tablesResult] = await connection.query(
      `SELECT TABLE_NAME, TABLE_COMMENT
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`,
      [schema],
    );
    const tables = tablesResult.map((row) => row.TABLE_NAME);
    const missingTableDescriptions = tables.filter((table) => !TABLE_COMMENTS[table]);
    const obsoleteTableDescriptions = Object.keys(TABLE_COMMENTS).filter((table) => !tables.includes(table));
    if (missingTableDescriptions.length || obsoleteTableDescriptions.length) {
      throw new Error(
        `El inventario de tablas no coincide. Sin descripción: ${missingTableDescriptions.join(', ') || 'ninguna'}. `
        + `Descripciones sin tabla: ${obsoleteTableDescriptions.join(', ') || 'ninguna'}.`,
      );
    }

    const [columns] = await connection.query(
      `SELECT c.TABLE_NAME, c.ORDINAL_POSITION, c.COLUMN_NAME, c.COLUMN_KEY,
              c.COLUMN_COMMENT, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
         FROM information_schema.COLUMNS c
         LEFT JOIN information_schema.KEY_COLUMN_USAGE k
           ON k.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND k.TABLE_NAME = c.TABLE_NAME
          AND k.COLUMN_NAME = c.COLUMN_NAME
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
        WHERE c.TABLE_SCHEMA = ?
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      [schema],
    );

    const descriptions = new Map();
    for (const column of columns) {
      const description = describeColumn(column);
      if (!description.trim()) throw new Error(`Comentario vacío para ${column.TABLE_NAME}.${column.COLUMN_NAME}`);
      descriptions.set(`${column.TABLE_NAME}.${column.COLUMN_NAME}`, description);
    }
    if (descriptions.size !== columns.length) {
      throw new Error(`Se describieron ${descriptions.size} de ${columns.length} columnas`);
    }

    const statements = [];
    for (const table of tables) {
      const [[createRow]] = await connection.query(`SHOW CREATE TABLE ${escapeIdentifier(table)}`);
      const createSql = createRow['Create Table'];
      const tableColumns = columns.filter((column) => column.TABLE_NAME === table);
      const modifications = tableColumns.map((column) => {
        const prefix = `  ${escapeIdentifier(column.COLUMN_NAME)} `;
        const definitionLine = createSql.split(/\r?\n/).find((line) => line.startsWith(prefix));
        if (!definitionLine) {
          throw new Error(`No se encontró la definición original de ${table}.${column.COLUMN_NAME}`);
        }
        const originalDefinition = definitionLine.trim().replace(/,$/, '');
        if (/\sCOMMENT\s+'/i.test(originalDefinition)) {
          throw new Error(`La columna ${table}.${column.COLUMN_NAME} ya contiene COMMENT`);
        }
        return `  MODIFY COLUMN ${originalDefinition} COMMENT ${escapeLiteral(descriptions.get(`${table}.${column.COLUMN_NAME}`))}`;
      });
      statements.push(
        `ALTER TABLE ${escapeIdentifier(table)}\n${modifications.join(',\n')},\n`
        + `  COMMENT = ${escapeLiteral(TABLE_COMMENTS[table])};`,
      );
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const migrationPath = path.join(backupDir, `${schema}_agregar_comments_${timestamp}.sql`);
    const migrationSql = [
      '-- Migración descriptiva generada desde SHOW CREATE TABLE.',
      '-- Solo agrega COMMENT a tablas y columnas; no modifica nombres ni relaciones.',
      `USE ${escapeIdentifier(schema)};`,
      '',
      ...statements,
      '',
    ].join('\n\n');
    fs.writeFileSync(migrationPath, migrationSql, 'utf8');

    console.log(`Inventario: ${tables.length} tablas y ${columns.length} columnas descritas.`);
    console.log(`Script generado: ${migrationPath}`);

    if (!shouldApply) {
      console.log('Modo generación: no se ejecutó ningún ALTER TABLE.');
      return;
    }

    const before = await collectStructuralSnapshot(connection, schema, tables);
    for (let index = 0; index < statements.length; index += 1) {
      await connection.query(statements[index]);
      console.log(`Aplicada ${index + 1}/${statements.length}: ${tables[index]}`);
    }
    const after = await collectStructuralSnapshot(connection, schema, tables);

    const [[coverage]] = await connection.query(
      `SELECT
          (SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE') AS total_tables,
          (SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
              AND COALESCE(TABLE_COMMENT, '') <> '') AS commented_tables,
          (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?) AS total_columns,
          (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND COALESCE(COLUMN_COMMENT, '') <> '') AS commented_columns`,
      [schema, schema, schema, schema],
    );

    if (before.structuralHash !== after.structuralHash) {
      throw new Error('La estructura sin comentarios cambió durante la migración');
    }
    if (before.rowCountHash !== after.rowCountHash) {
      throw new Error('La cantidad de filas cambió durante la migración');
    }
    if (Number(coverage.total_tables) !== Number(coverage.commented_tables)
      || Number(coverage.total_columns) !== Number(coverage.commented_columns)) {
      throw new Error(`Cobertura incompleta: ${JSON.stringify(coverage)}`);
    }

    console.log(`Hash estructural conservado: ${before.structuralHash}`);
    console.log(`Hash de conteos conservado: ${before.rowCountHash}`);
    console.log(
      `Cobertura verificada: ${coverage.commented_tables}/${coverage.total_tables} tablas; `
      + `${coverage.commented_columns}/${coverage.total_columns} columnas.`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
