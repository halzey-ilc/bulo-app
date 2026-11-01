import { router } from 'expo-router';
import type { AuthResponse } from '../api';
import { HOME_HREF, personaOf, useAuth } from '../store/auth';
import { toast } from '../store/ui';

/** После входа: сохранить сессию, закрыть экраны входа и открыть «домашнюю» вкладку роли. */
export async function completeLogin(r: AuthResponse, welcome = true) {
  await useAuth.getState().signIn(r);
  router.dismissTo(HOME_HREF[personaOf(r.user.role)]);
  if (welcome) toast.success(`Добро пожаловать${r.user.name ? `, ${r.user.name}` : ''}!`);
}
