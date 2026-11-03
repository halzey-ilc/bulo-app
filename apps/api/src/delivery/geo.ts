export interface Point {
  lat: number;
  lng: number;
}

/** Средняя скорость курьера по городу, км/ч — для оценки, когда нет маршрута по дорогам. */
export const CITY_SPEED_KMH = 25;
/** Дороги длиннее прямой: поправочный коэффициент для оценки. */
export const ROAD_FACTOR = 1.35;
/** Время на одну остановку (подняться, передать, получить код), мин. */
export const STOP_MINUTES = 5;
/** Ближе этого расстояния считаем, что курьер «подъезжает». */
export const ARRIVING_METERS = 400;

/** Расстояние по прямой, км. */
export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Оценка пути по дорогам: км и минуты. */
export function estimateLeg(a: Point, b: Point): { km: number; minutes: number } {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return { km, minutes: (km / CITY_SPEED_KMH) * 60 };
}

/**
 * Порядок объезда «ближайший следующий»: от текущей точки к ближайшей остановке, от неё — к следующей.
 * Для 5–15 адресов в день этого достаточно и работает мгновенно.
 */
export function orderStops<T extends Point>(start: Point, stops: T[]): T[] {
  const left = [...stops];
  const result: T[] = [];
  let cur = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (haversineKm(cur, left[i]) < haversineKm(cur, left[best])) best = i;
    }
    const [next] = left.splice(best, 1);
    result.push(next);
    cur = next;
  }
  return result;
}

/**
 * Накопленное время прибытия по каждой остановке: путь + время на предыдущие остановки.
 * legMinutes — минуты от предыдущей точки до этой (первая — от текущей позиции курьера).
 */
export function cumulativeEta(legMinutes: number[]): number[] {
  let acc = 0;
  return legMinutes.map((m, i) => {
    acc += m + (i > 0 ? STOP_MINUTES : 0);
    return acc;
  });
}

export function round(n: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
