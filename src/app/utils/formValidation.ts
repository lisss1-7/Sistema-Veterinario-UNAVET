const LETTERS_AND_SEPARATORS = /[^\p{L}\p{M}\s'-]/gu;

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
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
