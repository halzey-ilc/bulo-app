import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Courier } from '../api';

/** off — доступ есть, но геолокация выключена в самом телефоне. */
export type GeoPermission = 'unknown' | 'granted' | 'denied' | 'blocked' | 'off';

export interface LiveFix {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  at: number;
}

const SEND_EVERY = 10_000;

/** Спросить доступ к геопозиции (только «пока приложение открыто»). */
export async function askLocation(): Promise<GeoPermission> {
  try {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return 'granted';
    if (!cur.canAskAgain) return 'blocked';
    const r = await Location.requestForegroundPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

/** Разовая точка «где я» — для выбора адреса на карте. */
export async function currentPoint(): Promise<{ lat: number; lng: number } | null> {
  const p = await askLocation();
  if (p !== 'granted') return null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Курьер на линии: следим за геопозицией и раз в ~10 секунд отправляем её на сервер,
 * пока приложение открыто. Сход с линии — слежение останавливается, в фоне точки не отправляются.
 */
export function useCourierTracking(active: boolean) {
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [fix, setFix] = useState<LiveFix | null>(null);
  const latest = useRef<LiveFix | null>(null);
  const sentAt = useRef<number>(0);
  const [attempt, setAttempt] = useState(0);
  /** На какой попытке система/пользователь отказали — не переспрашиваем по кругу при возврате в приложение. */
  const failedAt = useRef<number | null>(null);

  const send = useCallback(async () => {
    const f = latest.current;
    // в фоне не шлём: доступ к геопозиции у нас только «пока приложение открыто»
    if (!f || f.at <= sentAt.current || AppState.currentState !== 'active') return;
    sentAt.current = f.at;
    try {
      await Courier.location({
        lat: f.lat,
        lng: f.lng,
        ...(f.accuracy != null ? { accuracy: Math.round(f.accuracy) } : {}),
        ...(f.heading != null && f.heading >= 0 ? { heading: f.heading } : {}),
        ...(f.speed != null && f.speed >= 0 ? { speed: f.speed } : {}),
      });
    } catch {
      // нет связи — отправим следующую точку
      sentAt.current = 0;
    }
  }, []);

  useEffect(() => {
    // Слежение не перезапускаем при сворачивании: системное окно «включите геолокацию»
    // само уводит приложение в фон, и перезапуск показывал бы его по кругу.
    if (!active) return;
    if (failedAt.current === attempt) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      const p = await askLocation();
      if (cancelled) return;
      setPermission(p);
      if (p !== 'granted') {
        failedAt.current = attempt;
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
      if (cancelled) return;
      if (!enabled) {
        failedAt.current = attempt;
        setPermission('off');
        return;
      }
      const onFix = (l: Location.LocationObject) => {
        const f: LiveFix = {
          lat: l.coords.latitude,
          lng: l.coords.longitude,
          heading: l.coords.heading ?? null,
          speed: l.coords.speed ?? null,
          accuracy: l.coords.accuracy ?? null,
          at: l.timestamp || Date.now(),
        };
        latest.current = f;
        setFix(f);
        // первую точку — сразу, дальше по таймеру
        if (!sentAt.current) void send();
      };
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) onFix(last);
        sub = await Location.watchPositionAsync(
          // раз в секунду — стрелка на карте едет плавно; на сервер всё равно уходит раз в 10 секунд
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: Platform.OS === 'android' ? 0 : 2 },
          onFix,
        );
        if (cancelled) sub.remove();
      } catch {
        // отказались включить геолокацию в системном окне — ждём, пока курьер сам нажмёт «включить»
        failedAt.current = attempt;
        setPermission('off');
        return;
      }
      timer = setInterval(() => void send(), SEND_EVERY);
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      if (timer) clearInterval(timer);
      sentAt.current = 0;
    };
  }, [active, send, attempt]);

  const retry = useCallback(async () => {
    const p = await askLocation();
    setPermission(p);
    // ещё раз запускаем слежение: заодно система предложит включить геолокацию
    if (p === 'granted') setAttempt((a) => a + 1);
    return p;
  }, []);

  /** Отправить последнюю точку сейчас (например, курьер свернул с маршрута — его надо перестроить). */
  const flush = useCallback(async () => {
    sentAt.current = 0;
    await send();
  }, [send]);

  return { permission, fix, retry, flush };
}
