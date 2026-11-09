import { createHash } from 'node:crypto';

/**
 * QR-оплата по кыргызскому стандарту (ELQR, на основе EMV): строка из полей «тег-длина-значение».
 * Последнее поле 63 — контрольная сумма: последние 4 символа SHA-256 от всего, что до него.
 * Из статического QR банка делаем QR с суммой: поле 01 = 12 (динамический), поле 54 = сумма в тыйынах.
 */

export interface Tlv {
  tag: string;
  value: string;
}

export function parseTlv(s: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) throw new Error('Неверная строка QR');
    out.push({ tag, value: s.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const field = (tag: string, value: string) => {
  if (value.length > 99) throw new Error(`Поле ${tag} слишком длинное`);
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
};

export function elqrChecksum(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(-4).toUpperCase();
}

/** Достаёт строку QR из того, что дал банк: может быть ссылкой вида https://bank.kg/...#0002... */
export function extractPayload(raw: string): string {
  const s = raw.trim();
  const hash = s.indexOf('#');
  const payload = hash >= 0 ? decodeURIComponent(s.slice(hash + 1)) : s;
  if (!payload.startsWith('0002')) throw new Error('Это не QR для оплаты (ожидается строка, начинающаяся с 0002…)');
  return payload;
}

export function isValidElqr(payload: string): boolean {
  try {
    const crc = payload.slice(-4);
    return payload.slice(-8, -4) === '6304' && elqrChecksum(payload.slice(0, -8)) === crc.toUpperCase();
  } catch {
    return false;
  }
}

/**
 * Строит QR с суммой. amount — в сомах; withAmount=false — вернуть исходный статический QR как есть.
 * Ссылочную часть (https://bank.kg/...#) сохраняем: банковские приложения узнают по ней свой QR.
 */
export function buildPaymentQr(raw: string, amount: number, withAmount: boolean): string {
  const s = raw.trim();
  const hash = s.indexOf('#');
  const prefix = hash >= 0 ? s.slice(0, hash + 1) : '';
  const payload = extractPayload(s);
  if (!withAmount || !(amount > 0)) return s;

  const fields = parseTlv(payload).filter((f) => f.tag !== '63' && f.tag !== '54');
  const out: Tlv[] = [];
  for (const f of fields) {
    if (f.tag === '01') out.push({ tag: '01', value: '12' });
    else out.push(f);
    // сумма идёт после валюты (53), как в EMV
    if (f.tag === '53') out.push({ tag: '54', value: String(Math.round(amount * 100)) });
  }
  if (!out.some((f) => f.tag === '54')) out.push({ tag: '54', value: String(Math.round(amount * 100)) });
  const body = out.map((f) => field(f.tag, f.value)).join('') + '6304';
  const full = body + elqrChecksum(body.slice(0, -4));
  return prefix ? prefix + encodeURIComponent(full) : full;
}
