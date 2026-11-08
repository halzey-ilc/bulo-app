import { Injectable, Logger } from '@nestjs/common';
import { estimateLeg, Point } from './geo';

/** Подсказка навигатора: где и куда повернуть. */
export interface Maneuver {
  lat: number;
  lng: number;
  /** Индекс точки линии маршрута, ближайшей к манёвру — по нему приложение понимает, проехал ли курьер поворот. */
  at: number;
  /** turn-left, turn-right, slight-left, sharp-right, uturn, straight, roundabout, arrive, depart */
  kind: string;
  /** Готовая фраза: «Поверните направо», «Съезд 2 с кольца» */
  text: string;
  /** Улица, на которую поворачиваем */
  street: string | null;
  /** Номер остановки, если это прибытие (0 — первая остановка) */
  stop?: number;
}

export interface Route {
  /** Линия маршрута [lat, lng] */
  geometry: [number, number][];
  /** Минуты по каждому участку между соседними точками */
  legMinutes: number[];
  legKm: number[];
  /** true — маршрут по дорогам (OSRM), false — оценка по прямой */
  byRoads: boolean;
  /** Повороты по всему маршруту (только для маршрута по дорогам) */
  maneuvers: Maneuver[];
}

/** Вариант адреса для подсказки. */
export interface GeoHit {
  /** «ул. Киевская, 95» */
  title: string;
  /** «Первомайский район, Бишкек» */
  subtitle: string;
  lat: number;
  lng: number;
  /** true — нашли сам дом, false — только улицу или район (пин надо поправить) */
  exact: boolean;
}

const TTL_MS = 60_000;
const GEO_TTL_MS = 24 * 3600_000;

/** Бишкек с пригородами: подсказки ищем только здесь. */
const BBOX = { minLng: 74.35, minLat: 42.74, maxLng: 74.85, maxLat: 42.98 };
const CENTER = { lat: 42.8746, lng: 74.5698 };

const UA = { 'User-Agent': 'BULO-delivery/1.0', 'Accept-Language': 'ru' };

/**
 * Маршрут по дорогам через OSRM (по умолчанию — публичный демо-сервер OpenStreetMap).
 * Для работы с реальной нагрузкой укажите свой сервер в ROUTING_URL или выключите: ROUTING_URL=off.
 * Если сервис недоступен — оценка по прямой с поправкой на дороги.
 *
 * Адреса: Photon (быстрый поиск по мере ввода, понимает неполные названия) и Nominatim
 * (точнее по номерам домов). Ответы кэшируются на сутки — оба сервиса бесплатные и просят не нагружать их.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger('Routing');
  private readonly cache = new Map<string, { at: number; route: Route }>();
  private readonly geoCache = new Map<string, { at: number; value: unknown }>();

  async route(points: Point[]): Promise<Route> {
    if (points.length < 2) return { geometry: points.map((p) => [p.lat, p.lng]), legMinutes: [], legKm: [], byRoads: false, maneuvers: [] };
    const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';');
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.route;

    const route = (await this.osrm(points)) ?? this.estimate(points);
    this.cache.set(key, { at: Date.now(), route });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return route;
  }

  private estimate(points: Point[]): Route {
    const legs = points.slice(1).map((p, i) => estimateLeg(points[i], p));
    return {
      geometry: points.map((p) => [p.lat, p.lng]),
      legMinutes: legs.map((l) => l.minutes),
      legKm: legs.map((l) => l.km),
      byRoads: false,
      maneuvers: [],
    };
  }

  private async osrm(points: Point[]): Promise<Route | null> {
    const base = process.env.ROUTING_URL ?? 'https://router.project-osrm.org';
    if (base === 'off') return null;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    try {
      const res = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': UA['User-Agent'] },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { routes?: OsrmRoute[] };
      const r = data.routes?.[0];
      if (!r) return null;
      const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      return {
        geometry,
        legMinutes: r.legs.map((l) => l.duration / 60),
        legKm: r.legs.map((l) => l.distance / 1000),
        byRoads: true,
        maneuvers: maneuversOf(r, geometry),
      };
    } catch (e) {
      this.logger.warn(`OSRM недоступен, считаю по прямой: ${(e as Error).message}`);
      return null;
    }
  }

  /* ───────── Адреса ───────── */

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.geoCache.get(key);
    if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.value as T;
    const value = await fn();
    // пустой ответ из-за сбоя сети не запоминаем надолго
    if (!(Array.isArray(value) && !value.length) && value != null) {
      this.geoCache.set(key, { at: Date.now(), value });
      if (this.geoCache.size > 2000) this.geoCache.delete(this.geoCache.keys().next().value!);
    }
    return value;
  }

  /** Варианты адреса по мере ввода: сначала точные дома, рядом с `near` (пекарня или курьер). */
  async suggest(query: string, near?: Point): Promise<GeoHit[]> {
    const q = normalizeQuery(query);
    if (q.length < 3) return [];
    const base = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
    if (base === 'off') return [];
    return this.cached(`s:${q}`, async () => {
      const wantsHouse = /\d/.test(q);
      const [photon, nominatim] = await Promise.all([this.photon(q, near), wantsHouse ? this.nominatim(q) : Promise.resolve([])]);
      const all = [...nominatim, ...photon];
      // одинаковые точки (в пределах ~40 м) и одинаковые подписи — один вариант
      const out: GeoHit[] = [];
      for (const h of all) {
        if (out.some((o) => o.title === h.title || dist(o, h) < 40)) continue;
        out.push(h);
      }
      // ищут дом — сначала точные совпадения
      if (wantsHouse) out.sort((a, b) => Number(b.exact) - Number(a.exact));
      return out.slice(0, 7);
    });
  }

  /** Лучшая точка для адреса (если пользователь не поставил пин сам). */
  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const [hit] = await this.suggest(address);
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  }

  /** Адрес по точке на карте: «ул. Киевская, 95». */
  async reverse(lat: number, lng: number): Promise<GeoHit | null> {
    const base = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
    if (base === 'off') return null;
    return this.cached(`r:${lat.toFixed(5)},${lng.toFixed(5)}`, async () => {
      try {
        const res = await fetch(`${base}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`, {
          signal: AbortSignal.timeout(5000),
          headers: UA,
        });
        if (!res.ok) return null;
        const r = (await res.json()) as NominatimHit;
        if (!r?.address) return null;
        const hit = fromNominatim(r);
        // пин стоит там, где поставили, а не в центре найденного дома
        return hit ? { ...hit, lat, lng } : null;
      } catch {
        return null;
      }
    });
  }

  private async photon(q: string, near?: Point): Promise<GeoHit[]> {
    const base = process.env.PHOTON_URL ?? 'https://photon.komoot.io';
    if (base === 'off') return [];
    const c = near ?? CENTER;
    const url =
      `${base}/api/?q=${encodeURIComponent(q)}&limit=10&lat=${c.lat}&lon=${c.lng}&location_bias_scale=0.4` +
      `&bbox=${BBOX.minLng},${BBOX.minLat},${BBOX.maxLng},${BBOX.maxLat}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: UA });
      if (!res.ok) return [];
      const data = (await res.json()) as { features?: PhotonFeature[] };
      return (data.features ?? []).map(fromPhoton).filter((h): h is GeoHit => !!h);
    } catch {
      return [];
    }
  }

  private async nominatim(q: string): Promise<GeoHit[]> {
    const base = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
    const query = /бишкек|bishkek/i.test(q) ? q : `${q}, Бишкек`;
    const url =
      `${base}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=kg&bounded=1` +
      `&viewbox=${BBOX.minLng},${BBOX.maxLat},${BBOX.maxLng},${BBOX.minLat}&q=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: UA });
      if (!res.ok) return [];
      return ((await res.json()) as NominatimHit[]).map(fromNominatim).filter((h): h is GeoHit => !!h);
    } catch {
      return [];
    }
  }
}

/* ───────── Разбор ответов ───────── */

interface OsrmStep {
  name: string;
  distance: number;
  maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number };
}
interface OsrmRoute {
  geometry: { coordinates: [number, number][] };
  legs: { duration: number; distance: number; steps?: OsrmStep[] }[];
}

const SIDE: Record<string, string> = {
  left: 'налево',
  right: 'направо',
  'slight left': 'плавно налево',
  'slight right': 'плавно направо',
  'sharp left': 'резко налево',
  'sharp right': 'резко направо',
};

/** Повороты OSRM → короткие русские подсказки. Мелкие «продолжайте прямо» отбрасываем. */
export function maneuversOf(r: OsrmRoute, geometry: [number, number][]): Maneuver[] {
  const out: Maneuver[] = [];
  let from = 0;
  r.legs.forEach((leg, legIdx) => {
    (leg.steps ?? []).forEach((s) => {
      const { type, modifier, location, exit } = s.maneuver;
      const [lng, lat] = location;
      const street = s.name?.trim() ? ruStreet(s.name.trim()) : null;
      let kind = '';
      let text = '';
      if (type === 'arrive') {
        kind = 'arrive';
        text = legIdx === r.legs.length - 1 ? 'Вы приехали' : 'Остановка';
      } else if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
        kind = 'roundabout';
        text = exit ? `На кольце — ${exit}-й съезд` : 'Проезжайте кольцо';
      } else if (modifier === 'uturn') {
        kind = 'uturn';
        text = 'Развернитесь';
      } else if (type === 'depart') {
        return; // старт — не подсказка
      } else if (
        modifier &&
        SIDE[modifier] &&
        (['turn', 'end of road', 'fork', 'on ramp', 'off ramp', 'merge'].includes(type) ||
          // смена названия улицы на изгибе — подсказка только при настоящем повороте
          (['new name', 'continue'].includes(type) && !modifier.startsWith('slight')))
      ) {
        kind = modifier.replace(' ', '-').replace(/^(left|right)$/, 'turn-$1');
        text = type === 'fork' ? `Держитесь ${SIDE[modifier].replace('плавно ', '').replace('резко ', '')}` : `Поверните ${SIDE[modifier]}`;
      } else {
        return;
      }
      const at = nearestIndex(geometry, lat, lng, from);
      from = at;
      out.push({ lat, lng, at, kind, text, street, ...(type === 'arrive' ? { stop: legIdx } : {}) });
    });
  });
  return out;
}

function nearestIndex(g: [number, number][], lat: number, lng: number, from: number): number {
  let best = from;
  let bd = Infinity;
  for (let i = from; i < g.length; i++) {
    const d = (g[i][0] - lat) ** 2 + (g[i][1] - lng) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
    // ушли далеко от лучшей точки — дальше искать нет смысла
    if (bd < 1e-9 && i - best > 30) break;
  }
  return best;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    type?: string;
    osm_value?: string;
  };
}

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    amenity?: string;
    shop?: string;
  };
}

function fromPhoton(f: PhotonFeature): GeoHit | null {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = p.street ? streetLabel(p.street) : null;
  let title: string;
  let exact = false;
  if (p.housenumber && (street || p.name)) {
    title = `${street ?? streetLabel(p.name!)}, ${p.housenumber}`;
    exact = true;
  } else if (p.type === 'street' && p.name) {
    title = streetLabel(p.name);
  } else if (p.name) {
    // заведение или микрорайон
    title = street ? `${p.name}, ${street}` : p.name;
    exact = p.type === 'house';
  } else return null;
  const subtitle = [p.district ?? p.locality, p.city ?? p.county].filter(Boolean).join(', ');
  return { title, subtitle: cleanSubtitle(subtitle), lat, lng, exact };
}

function fromNominatim(r: NominatimHit): GeoHit | null {
  const a = r.address ?? {};
  const road = a.road ?? a.pedestrian;
  const place = a.amenity ?? a.shop ?? r.name;
  let title: string;
  let exact = false;
  if (road && a.house_number) {
    title = `${streetLabel(road)}, ${a.house_number}`;
    exact = true;
  } else if (road) title = place && place !== road ? `${place}, ${streetLabel(road)}` : streetLabel(road);
  else if (place) title = place;
  else if (a.neighbourhood ?? a.suburb ?? a.quarter) title = (a.neighbourhood ?? a.suburb ?? a.quarter)!;
  else return null;
  const subtitle = [a.city_district ?? a.suburb, a.city ?? a.town ?? a.village].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');
  return { title, subtitle: cleanSubtitle(subtitle), lat: Number(r.lat), lng: Number(r.lon), exact };
}

/** «Киевская улица» → «ул. Киевская», «проспект Чуй» → «пр. Чуй». */
export function streetLabel(name: string): string {
  const n = name.trim();
  const rules: [RegExp, string][] = [
    [/^(.*?)\s+улица$/i, 'ул. $1'],
    [/^улица\s+(.*)$/i, 'ул. $1'],
    [/^(.*?)\s+проспект$/i, 'пр. $1'],
    [/^проспект\s+(.*)$/i, 'пр. $1'],
    [/^(.*?)\s+бульвар$/i, 'бул. $1'],
    [/^бульвар\s+(.*)$/i, 'бул. $1'],
    [/^(.*?)\s+переулок$/i, 'пер. $1'],
    [/^переулок\s+(.*)$/i, 'пер. $1'],
  ];
  for (const [re, to] of rules) if (re.test(n)) return n.replace(re, to);
  return n;
}

/**
 * Названия улиц в маршрутах приходят по-кыргызски (основное имя в OpenStreetMap):
 * «Исхак Раззаков көчөсү» → «ул. Исхак Раззаков», «Чүй проспекти» → «пр. Чуй».
 */
export function ruStreet(name: string): string {
  const plain = (s: string) => s.replace(/ү/g, 'у').replace(/Ү/g, 'У').replace(/ө/g, 'о').replace(/Ө/g, 'О').replace(/ң/g, 'н').replace(/Ң/g, 'Н');
  const rules: [RegExp, string][] = [
    [/^(.*?)\s+көчөсү$/i, 'ул. $1'],
    [/^(.*?)\s+проспекти$/i, 'пр. $1'],
    [/^(.*?)\s+бульвары$/i, 'бул. $1'],
    [/^(.*?)\s+тыкыры$/i, 'пер. $1'],
  ];
  for (const [re, to] of rules) if (re.test(name)) return plain(name.replace(re, to));
  return streetLabel(plain(name));
}

/** Убираем то, что мешает поиску: «г. Бишкек», «ул.», «д.», лишние запятые. */
export function normalizeQuery(q: string): string {
  return q
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s,])(г\.?|город)\s*бишкек/gi, ' ')
    .replace(/(^|[\s,])бишкек/gi, ' ')
    .replace(/(^|[\s,])(ул\.?|улица)\s+/gi, ' ')
    .replace(/(^|[\s,])(пр-т|просп\.?|пр\.)\s*/gi, ' проспект ')
    .replace(/(^|[\s,])(д\.|дом)\s*(\d)/gi, ' $3')
    .replace(/(^|[\s,])(мкр\.?|микрорайон)\s*/gi, ' мкр ')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «Биринчи май району, Bishkek» → «Бишкек»; «Первомайский район, город Бишкек» → «Первомайский район, Бишкек». */
export function cleanSubtitle(s: string): string {
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/район[уы]|кичи|көчө/i.test(p))
    .map((p) => (/^(город\s+)?(бишкек|bishkek)$/i.test(p) ? 'Бишкек' : p));
  return [...new Set(parts)].join(', ') || 'Бишкек';
}

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
