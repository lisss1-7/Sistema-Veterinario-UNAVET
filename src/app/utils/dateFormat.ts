export const formatDateForDisplay = (value?: string | null) => {
  if (!value) return '';

  const normalized = String(value).trim();
  if (!normalized) return '';

  const isoMatch = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  if (!isoMatch) return normalized;

  const [year, month, day] = isoMatch[0].split('-');
  return `${day}/${month}/${year}`;
};
