import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL, getToken } from '../api/client';

/**
 * Отчёты о сбоях: ошибка уходит на наш сервер (POST /api/client-errors) и видна в журнале веб-панели.
 * Без внешних сервисов и аккаунтов. Повторы одной и той же ошибки не шлём.
 */
let screen = '';
const sent = new Set<string>();

export function setCrashScreen(path: string) {
  screen = path;
}

export function reportError(e: unknown, level: 'fatal' | 'error' = 'error') {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const key = `${err.message}|${screen}`;
    if (sent.has(key) || sent.size > 50) return;
    sent.add(key);
    const token = getToken();
    void fetch(`${API_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message: err.message.slice(0, 2000) || 'Ошибка без текста',
        stack: err.stack?.slice(0, 8000),
        screen: screen.slice(0, 200),
        platform: `${Platform.OS} ${Platform.Version ?? ''}`.trim().slice(0, 40),
        version: Constants.expoConfig?.version ?? '',
        level,
      }),
    }).catch(() => {});
  } catch {
    // отчёт о сбое не должен сам ронять приложение
  }
}

let installed = false;

/** Перехват необработанных ошибок: на телефоне — через ErrorUtils, в браузере — window.onerror. */
export function installCrashHandler() {
  if (installed || __DEV__) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void };
    addEventListener?: (t: string, h: (ev: { reason?: unknown; error?: unknown; message?: string }) => void) => void;
  };
  if (g.ErrorUtils) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((e, fatal) => {
      reportError(e, fatal ? 'fatal' : 'error');
      prev(e, fatal);
    });
  }
  if (Platform.OS === 'web' && g.addEventListener) {
    g.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
    g.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
  }
}
