const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[\s'-][\p{L}\p{M}]+)*$/u;
const PHONE_PATTERN = /^\d{8,15}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidName = (value) =>
  typeof value === 'string' &&
  value.trim().length >= 2 &&
  value.trim().length <= 80 &&
  NAME_PATTERN.test(value.trim());

const isValidPhone = (value) =>
  typeof value === 'string' && PHONE_PATTERN.test(value);

const isValidAgeSpacing = (value) => {
  const normalized = String(value ?? '').trim();
  return Boolean(normalized) && !/(?:\d\p{L}|\p{L}\d)/u.test(normalized);
};

const isValidIsoDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const getTodayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

module.exports = {
  isValidName,
  isValidPhone,
  isValidAgeSpacing,
  isValidIsoDate,
  isTodayOrFuture: (value) => isValidIsoDate(value) && value >= getTodayLocal(),
  isTodayOrPast: (value) => isValidIsoDate(value) && value <= getTodayLocal(),
};
