const { isValidName, isValidPhone, isTodayOrFuture } = require('../utils/inputValidation');

const PERSON_NAME_FIELDS = [
  'petName',
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
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TEXT_LENGTH = 10000;
// Patient photos are sent as base64 data URLs. Keep this below the 10 MB
// JSON body limit while allowing normal compressed images.
const MAX_PHOTO_LENGTH = 8 * 1024 * 1024;

const reject = (res, message) => res.status(400).json({ message });

const validateRequest = (req, res, next) => {
  if (
    req.path.startsWith('/api/inventario') ||
    !['POST', 'PUT', 'PATCH'].includes(req.method) ||
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    return next();
  }

  for (const [field, value] of Object.entries(req.body)) {
    if (typeof value === 'string') {
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
        return reject(res, `El campo ${field} contiene caracteres no permitidos`);
      }
      const maxLength = field === 'photo' ? MAX_PHOTO_LENGTH : MAX_TEXT_LENGTH;
      if (value.length > maxLength) {
        return reject(res, `El campo ${field} excede la longitud permitida`);
      }
    }
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
      return reject(res, `El campo ${field} debe contener entre 8 y 15 dígitos`);
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
