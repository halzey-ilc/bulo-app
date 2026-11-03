import { Injectable, Logger } from '@nestjs/common';
import { estimateLeg, Point } from './geo';

export interface Route {
  /** Линия маршрута [lat, lng] */
  geometry: [number, number][];
  /** Минуты по каждому участку между соседними точками */
  legMinutes: number[];
  legKm: number[];
  /** true — маршрут по дорогам (OSRM), false — оценка по прямой */
  byRoads: boolean;
}

const TTL_MS = 60_000;

/**
 * Маршрут по дорогам через OSRM (по умолчанию — публичный демо-сервер OpenStreetMap).
 * Для работы с реальной нагрузкой укажите свой сервер в ROUTING_URL или выключите: ROUTING_URL=off.
 * Если сервис недоступен — оценка по прямой с поправкой на дороги.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger('Routing');
  private readonly cache = new Map<string, { at: number; route: Route }>();

  async route(points: Point[]): Promise<Route> {
    if (points.length < 2) return { geometry: points.map((p) => [p.lat, p.lng]), legMinutes: [], legKm: [], byRoads: false };
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
    };
  }

  private async osrm(points: Point[]): Promise<Route | null> {
    const base = process.env.ROUTING_URL ?? 'https://router.project-osrm.org';
    if (base === 'off') return null;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    try {
      const res = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'BULO-delivery/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        routes?: { geometry: { coordinates: [number, number][] }; legs: { duration: number; distance: number }[] }[];
      };
      const r = data.routes?.[0];
      if (!r) return null;
      return {
        geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        legMinutes: r.legs.map((l) => l.duration / 60),
        legKm: r.legs.map((l) => l.distance / 1000),
        byRoads: true,
      };
    } catch (e) {
      this.logger.warn(`OSRM недоступен, считаю по прямой: ${(e as Error).message}`);
      return null;
    }
  }

  /** Координаты по адресу (OpenStreetMap Nominatim). Лучшее усилие: при неудаче — null. */
  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const base = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
    if (base === 'off') return null;
    const q = /бишкек|bishkek/i.test(address) ? address : `${address}, Бишкек`;
    try {
      const res = await fetch(`${base}/search?format=json&limit=1&countrycodes=kg&q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'BULO-delivery/1.0', 'Accept-Language': 'ru' },
      });
      if (!res.ok) return null;
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    } catch {
      return null;
    }
  }
}
