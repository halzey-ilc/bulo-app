import { Linking, Platform } from 'react-native';
import { toast } from '../store/ui';
import { plural } from './format';

/** 12.4 → «12,4 км», 0.35 → «350 м». */
export function kmText(km: number | null | undefined): string {
  if (km == null) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} м`;
  return `${String(Math.round(km * 10) / 10).replace('.', ',')} км`;
}

/** 48 → «48 мин», 75 → «1 ч 15 мин». */
export function minText(min: number | null | undefined): string {
  if (min == null) return '';
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}

/** Время по часам: «14:35». */
export function clock(ts: string | number | Date | null | undefined): string {
  if (ts == null) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Минуты до момента (с учётом того, что ETA пересчитывается раз в несколько секунд). */
export function minutesUntil(ts: string | null | undefined, now = Date.now()): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.round((t - now) / 60000));
}

export const addressCount = (n: number) => `${n} ${plural(n, 'адрес', 'адреса', 'адресов')}`;

/* ───────── Навигаторы ───────── */

export type NavApp = 'dgis' | 'yandexnavi' | 'yandexmaps' | 'google';

export const NAV_APPS: { key: NavApp; title: string; subtitle: string }[] = [
  { key: 'dgis', title: '2ГИС', subtitle: 'Подробные карты Бишкека' },
  { key: 'yandexnavi', title: 'Яндекс Навигатор', subtitle: 'Голосовые подсказки и пробки' },
  { key: 'yandexmaps', title: 'Яндекс Карты', subtitle: 'Маршрут на машине' },
  { key: 'google', title: 'Google Карты', subtitle: 'Маршрут на машине' },
];

function navUrls(app: NavApp, p: { lat: number; lng: number }): { app: string; web: string } {
  const { lat, lng } = p;
  switch (app) {
    case 'dgis':
      return { app: `dgis://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`, web: `https://2gis.kg/bishkek/directions/points/%7C${lng}%2C${lat}` };
    case 'yandexnavi':
      return { app: `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`, web: `https://yandex.ru/maps/?rtext=~${lat}%2C${lng}&rtt=auto` };
    case 'yandexmaps':
      return { app: `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`, web: `https://yandex.ru/maps/?rtext=~${lat}%2C${lng}&rtt=auto` };
    case 'google':
      return {
        app: Platform.OS === 'ios' ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving` : `google.navigation:q=${lat},${lng}&mode=d`,
        web: `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}&travelmode=driving`,
      };
  }
}

/** Открыть маршрут в навигаторе; если приложения нет — веб-версию той же карты. */
export async function openNavigator(app: NavApp, point: { lat: number; lng: number } | null, address?: string | null) {
  if (!point) {
    const q = encodeURIComponent(address && !address.includes('Бишкек') ? `Бишкек, ${address}` : address ?? 'Бишкек');
    Linking.openURL(`https://2gis.kg/bishkek/search/${q}`).catch(() => toast.error('Не удалось открыть карту'));
    return;
  }
  const u = navUrls(app, point);
  if (Platform.OS !== 'web') {
    try {
      if (await Linking.canOpenURL(u.app)) {
        await Linking.openURL(u.app);
        return;
      }
    } catch {
      // ниже попробуем напрямую
    }
    // На Android 11+ canOpenURL не видит чужие схемы без <queries> — пробуем открыть напрямую.
    try {
      await Linking.openURL(u.app);
      return;
    } catch {
      // приложения нет — веб
    }
  }
  Linking.openURL(u.web).catch(() => toast.error('Не удалось открыть карту'));
}
