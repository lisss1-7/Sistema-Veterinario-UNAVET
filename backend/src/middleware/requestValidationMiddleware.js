const { isValidPetName, isValidName, isValidPhone, isTodayOrFuture } = require('../utils/inputValidation');

const PERSON_NAME_FIELDS = [
  'tutorFirstName',
  'tutorMiddleName',
  'tutorFirstSurname',
  'tutorSecondSurname',
];
const PHONE_FIELDS = ['phone', 'tutorPhone'];
const EMAIL_FIELDS = ['email', 'correo', 'tutorEmail'];
const NON_NEGATIVE_FIELDS = [
  'groomingCost', 'transportCost', 'totalDoses', 'appliedDoses',
  'interval', 'quantity', 'amount', 'discount', 'unitPrice',
  'currentStock', 'minStock', 'price', 'purchasePrice',
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TEXT_LENGTH = 10000;
const PHOTO_FIELDS = new Set(['photo', 'attachmentPhoto']);
// Patient and treatment photos arrive as temporary base64 data URLs and are
// moved to file storage by the controllers.
const MAX_PHOTO_LENGTH = 8 * 1024 * 1024;

const reject = (res, message) => res.status(400).json({ message });

const validateBodyShape = (value, field = 'body', depth = 0) => {
  if (depth > 8) return `El campo ${field} excede la profundidad permitida`;

  if (typeof value === 'string') {
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return `El campo ${field} contiene caracteres no permitidos`;
    }
    const fieldName = field.split('.').at(-1)?.replace(/\[\d+\]$/, '');
    const maxLength = PHOTO_FIELDS.has(fieldName)
      ? MAX_PHOTO_LENGTH
      : MAX_TEXT_LENGTH;
    if (value.length > maxLength) {
      return `El campo ${field} excede la longitud permitida`;
    }
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length > 200) return `El campo ${field} contiene demasiados elementos`;
    for (let index = 0; index < value.length; index += 1) {
      const error = validateBodyShape(value[index], `${field}[${index}]`, depth + 1);
      if (error) return error;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 200) return `El campo ${field} contiene demasiadas propiedades`;
    for (const [key, nestedValue] of entries) {
      const error = validateBodyShape(nestedValue, `${field}.${key}`, depth + 1);
      if (error) return error;
    }
  }

  return null;
};

const validateRequest = (req, res, next) => {
  if (
    !['POST', 'PUT', 'PATCH'].includes(req.method) ||
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    return next();
  }

  const bodyShapeError = validateBodyShape(req.body);
  if (bodyShapeError) return reject(res, bodyShapeError);

  if (req.body.petName !== undefined && req.body.petName !== '' && !isValidPetName(req.body.petName)) {
    return reject(res, 'El nombre de la mascota puede contener letras y números, debe tener entre 2 y 80 caracteres y no se permiten caracteres especiales');
  }

  const nameFields = [...PERSON_NAME_FIELDS];
  if (req.path.startsWith('/api/usuarios') || req.path.startsWith('/api/perfil')) {
    nameFields.push('firstName', 'middleName', 'firstSurname', 'secondSurname');
  }

  for (const field of nameFields) {
    const value = req.body[field];
    if (value !== undefined && value !== '' && !isValidName(value)) {
      return reject(res, `El campo ${field} solo puede contener letras`);
    }
  }

  for (const field of PHONE_FIELDS) {
    const value = req.body[field];
    if (value !== undefined && value !== '' && !isValidPhone(String(value))) {
      return reject(res, `El campo ${field} debe contener entre 8 y 12 dígitos`);
    }
  }

  for (const field of EMAIL_FIELDS) {
    const value = req.body[field];
    if (value !== undefined && value !== '' && !EMAIL_PATTERN.test(String(value))) {
      return reject(res, `El campo ${field} no contiene un correo válido`);
    }
  }

  for (const field of NON_NEGATIVE_FIELDS) {
    const value = req.body[field];
    if (value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return reject(res, `El campo ${field} debe ser un número válido mayor o igual a cero`);
    }
  }

  if (
    (req.path.startsWith('/api/citas') || req.path.startsWith('/api/grooming')) &&
    req.body.date &&
    !isTodayOrFuture(req.body.date)
  ) {
    return reject(res, 'La fecha de la cita no puede estar en el pasado');
  }

  return next();
};

module.exports = { validateRequest };
