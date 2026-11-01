/**
 * Приводит номер к виду +996XXXXXXXXX. Принимает 0700 123 456, 996700123456, +996 (700) 12-34-56.
 * Номера других стран оставляет как есть (только цифры с «+»).
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `+996${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits)) return `+996${digits}`;
  if (/^996\d{9}$/.test(digits)) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}
