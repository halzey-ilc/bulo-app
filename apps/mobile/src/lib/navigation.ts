import type { Maneuver } from '../api';

type P = { lat: number; lng: number };

/** Расстояние в метрах между двумя точками. */
export function meters(a: P, b: P): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export interface NextTurn {
  maneuver: Maneuver;
  /** Метров до манёвра по линии маршрута */
  distance: number;
  /** Следующий за ним манёвр — «затем налево» */
  then: Maneuver | null;
}

export interface NavState {
  /** Курьер ушёл с линии маршрута дальше ~70 м — пора перестроить */
  offRoute: boolean;
  next: NextTurn | null;
}

/**
 * Где курьер на маршруте и какой поворот следующий.
 * Ищем ближайшую точку линии (вперёд от прошлой, чтобы на петлях не «прыгать» назад),
 * дальше суммируем отрезки до точки манёвра.
 */
export function navState(geometry: [number, number][] | undefined, maneuvers: Maneuver[] | undefined, pos: P | null, hint = 0): NavState & { index: number } {
  if (!geometry || geometry.length < 2 || !pos) return { offRoute: false, next: null, index: 0 };
  let best = 0;
  let bd = Infinity;
  const from = Math.max(0, hint - 5);
  for (let i = from; i < geometry.length; i++) {
    const d = meters(pos, { lat: geometry[i][0], lng: geometry[i][1] });
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  // по «подсказке» ничего близкого — ищем с начала (маршрут перестроили)
  if (bd > 70 && from > 0) return navState(geometry, maneuvers, pos, 0);
  const list = maneuvers ?? [];
  const k = list.findIndex((m) => m.at > best);
  if (k < 0) return { offRoute: bd > 70, next: null, index: best };
  const m = list[k];
  let distance = bd;
  for (let i = best; i < m.at && i < geometry.length - 1; i++) {
    distance += meters({ lat: geometry[i][0], lng: geometry[i][1] }, { lat: geometry[i + 1][0], lng: geometry[i + 1][1] });
  }
  return { offRoute: bd > 70, next: { maneuver: m, distance, then: list[k + 1] ?? null }, index: best };
}

/** 1240 → «1,2 км», 340 → «350 м», 40 → «сейчас». */
export function distText(m: number): string {
  if (m < 30) return 'сейчас';
  if (m < 1000) return `${Math.round(m / 50) * 50 || 50} м`;
  return `${(Math.round(m / 100) / 10).toString().replace('.', ',')} км`;
}
