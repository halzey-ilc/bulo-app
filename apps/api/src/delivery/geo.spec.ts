import { cumulativeEta, estimateLeg, haversineKm, orderStops, STOP_MINUTES } from './geo';

// Бишкек: площадь Ала-Тоо, ЦУМ, Ошский базар
const alaToo = { lat: 42.8765, lng: 74.6037 };
const tsum = { lat: 42.8762, lng: 74.6143 };
const osh = { lat: 42.8747, lng: 74.5735 };

describe('geo', () => {
  it('считает расстояние по прямой', () => {
    expect(haversineKm(alaToo, tsum)).toBeGreaterThan(0.8);
    expect(haversineKm(alaToo, tsum)).toBeLessThan(1);
  });

  it('оценивает время в пути по городу', () => {
    const leg = estimateLeg(alaToo, osh);
    expect(leg.km).toBeGreaterThan(haversineKm(alaToo, osh));
    expect(leg.minutes).toBeGreaterThan(5);
    expect(leg.minutes).toBeLessThan(15);
  });

  it('объезжает ближайшие точки первыми', () => {
    const stops = [
      { id: 'osh', ...osh },
      { id: 'tsum', ...tsum },
    ];
    expect(orderStops(alaToo, stops).map((s) => s.id)).toEqual(['tsum', 'osh']);
  });

  it('добавляет время на каждую предыдущую остановку', () => {
    expect(cumulativeEta([10, 6, 4])).toEqual([10, 16 + STOP_MINUTES, 20 + 2 * STOP_MINUTES]);
  });
});
