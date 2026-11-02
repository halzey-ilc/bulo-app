import { router } from 'expo-router';
import type { AuthResponse, User } from '../api';
import { hapticSuccess } from '../components/ui';
import { ROLE_LABELS } from '../shared';
import { HOME_HREF, personaOf, useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import { toast } from '../store/ui';

/** «Здравствуйте, Анна! Вы вошли как Бухгалтер». */
export function welcomeText(user: User): string {
  const name = user.name || user.partner?.contactName;
  const role = ROLE_LABELS[user.role] ?? '';
  const hello = name ? `Здравствуйте, ${name.split(/\s+/)[0]}!` : 'Добро пожаловать!';
  if (user.role === 'PARTNER' && user.partner?.name) return `${hello} Вы вошли как партнёр «${user.partner.name}»`;
  return role ? `${hello} Вы вошли как ${role}` : hello;
}

/** После входа: сохранить сессию, закрыть экраны входа и открыть «домашнюю» вкладку роли. */
export async function completeLogin(r: AuthResponse, welcome = true) {
  await useAuth.getState().signIn(r);
  usePrefs.getState().setOnboardingSeen();
  router.dismissTo(HOME_HREF[personaOf(r.user.role)]);
  if (welcome) {
    hapticSuccess();
    toast.success(welcomeText(r.user));
  }
}
