import { router } from 'expo-router';
import type { AuthResponse, User } from '../api';
import { hapticSuccess } from '../components/ui';
import { ROLE_LABELS } from '../shared';
import { HOME_HREF, personaOf, useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import { toast } from '../store/ui';

/** «Здравствуйте, Анна! Вы вошли как Бухгалтер». Гостю кофейни — без роли. */
export function welcomeText(user: User): string {
  const name = user.name || user.partner?.contactName;
  const hello = name ? `Здравствуйте, ${name.split(/\s+/)[0]}!` : 'Добро пожаловать!';
  if (user.role === 'CLIENT' && !user.partnerId) return `${hello} Рады видеть в BULO`;
  const role = ROLE_LABELS[user.role] ?? '';
  if (user.role === 'PARTNER' && user.partner?.name) return `${hello} Вы вошли как партнёр «${user.partner.name}»`;
  return role ? `${hello} Вы вошли как ${role}` : hello;
}

/** Куда вернуть после входа (например, гость нажал «Забронировать» без входа). */
let afterLogin: string | null = null;
export function returnAfterLogin(path: string | null) {
  afterLogin = path;
}

/** После входа: сохранить сессию, закрыть экраны входа и открыть «домашнюю» вкладку роли (или вернуть, откуда пришли). */
export async function completeLogin(r: AuthResponse, welcome = true) {
  await useAuth.getState().signIn(r);
  usePrefs.getState().setOnboardingSeen();
  const persona = personaOf(r.user.role);
  const next = persona === 'buyer' ? afterLogin : null;
  afterLogin = null;
  router.dismissTo(HOME_HREF[persona]);
  if (next) setTimeout(() => router.push(next as never), 60);
  if (welcome) {
    hapticSuccess();
    toast.success(welcomeText(r.user));
  }
}
