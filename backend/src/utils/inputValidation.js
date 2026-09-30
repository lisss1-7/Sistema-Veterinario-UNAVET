const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[\s'-][\p{L}\p{M}]+)*$/u;
const PHONE_PATTERN = /^\d{8,12}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const CLINIC_TIME_ZONE = 'America/Guatemala';
const CLINIC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const isValidName = (value) =>
  typeof value === 'string' &&
  value.trim().length >= 2 &&
  value.trim().length <= 80 &&
  NAME_PATTERN.test(value.trim());

const isValidPetName = (value) =>
  typeof value === 'string' &&
  value.trim().length >= 2 &&
  value.trim().length <= 80 &&
  /^[\p{L}\p{M}0-9]+(?:[\s'-][\p{L}\p{M}0-9]+)*$/u.test(value.trim());

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

const getClinicDateTime = (now = new Date()) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;

  const parts = Object.fromEntries(
    CLINIC_DATE_TIME_FORMATTER
      .formatToParts(now)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

const getTodayLocal = (now = new Date()) => getClinicDateTime(now)?.date || '';

const isFutureDateTime = (date, time, now = new Date()) => {
  if (!isValidIsoDate(date) || typeof time !== 'string' || !TIME_PATTERN.test(time)) {
    return false;
  }

  const clinicNow = getClinicDateTime(now);
  if (!clinicNow) return false;

  const selectedDateTime = `${date}T${time.slice(0, 5)}`;
  const currentDateTime = `${clinicNow.date}T${clinicNow.time}`;
  return selectedDateTime > currentDateTime;
};

module.exports = {
  isValidName,
  isValidPetName,
  isValidPhone,
  isValidAgeSpacing,
  isValidIsoDate,
  isFutureDateTime,
  isTodayOrFuture: (value, now = new Date()) =>
    isValidIsoDate(value) && value >= getTodayLocal(now),
  isTodayOrPast: (value, now = new Date()) =>
    isValidIsoDate(value) && value <= getTodayLocal(now),
};
