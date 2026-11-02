import { api, AuthResponse } from '../api';

/** Смена своего пароля. Сервер завершает другие сессии и выдаёт новый токен. */
export function changePassword(dto: { currentPassword?: string; newPassword: string }) {
  return api.post<AuthResponse>('/auth/me/password', dto);
}

/** Оценка надёжности пароля: 0…4 и подпись. */
export function passwordStrength(p: string): { score: number; label: string } {
  if (!p) return { score: 0, label: '' };
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-ZА-Я]/.test(p) && /[a-zа-я]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-zА-Яа-я0-9]/.test(p)) s++;
  else if (/\d/.test(p)) s += 0.5;
  const score = Math.min(4, Math.floor(s));
  return { score, label: ['Слишком короткий', 'Слабый', 'Неплохой', 'Хороший', 'Надёжный'][score] };
}
