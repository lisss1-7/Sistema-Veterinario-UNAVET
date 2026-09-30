const LETTERS_AND_SEPARATORS = /[^\p{L}\p{M}\s'-]/gu;
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

const getClinicDateTime = (now = new Date()) => {
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

export const sanitizeName = (value: string) => {
  const cleaned = value
    .replace(LETTERS_AND_SEPARATORS, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 80);

  return cleaned.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase('es-GT')}`
  );
};

export const sanitizePhone = (value: string) =>
  value.replace(/\D/g, '').slice(0, 15);

export const sanitizeAgeText = (value: string) =>
  value
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 50);

export const isValidName = (value?: string) =>
  Boolean(
    value &&
      value.trim().length >= 2 &&
      /^[\p{L}\p{M}]+(?:[\s'-][\p{L}\p{M}]+)*$/u.test(value.trim())
  );

export const isValidPhone = (value?: string) =>
  Boolean(value && /^\d{8,15}$/.test(value));

export const isValidAgeSpacing = (value?: string | number) =>
  Boolean(
    String(value ?? '').trim() &&
      !/(?:\d\p{L}|\p{L}\d)/u.test(String(value).trim())
  );

export const isValidEmail = (value?: string) =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()));

export const isNonNegativeNumber = (value: unknown) =>
  value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export const getTodayLocal = () => {
  return getClinicDateTime().date;
};

export const isClinicDateTimePastOrCurrent = (
  date?: string,
  time?: string,
  now = new Date()
) => {
  if (!date || !time) return false;

  const clinicNow = getClinicDateTime(now);
  return `${date}T${time.slice(0, 5)}` <= `${clinicNow.date}T${clinicNow.time}`;
};

export const sanitizePetName = (value: string) =>
  value
    .replace(/[^\p{L}\p{M}0-9\s'-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 80)
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase('es-GT')}`
    );

export const isValidPetName = (value?: string) =>
  Boolean(
    value &&
      value.trim().length >= 2 &&
      value.trim().length <= 80 &&
      /^[\p{L}\p{M}0-9]+(?:[\s'-][\p{L}\p{M}0-9]+)*$/u.test(value.trim())
  );
