import { cleanSubtitle, normalizeQuery, ruStreet, streetLabel } from './routing.service';

describe('адреса и названия улиц', () => {
  it('чистит запрос от «г. Бишкек», «ул.», «д.»', () => {
    expect(normalizeQuery('г. Бишкек, ул. Киевская, д. 95')).toBe('Киевская 95');
    expect(normalizeQuery('пр. Чуй 155')).toBe('проспект Чуй 155');
    expect(normalizeQuery('Мкр. Джал 23')).toBe('мкр Джал 23');
  });

  it('пишет улицы коротко, как на табличках', () => {
    expect(streetLabel('Киевская улица')).toBe('ул. Киевская');
    expect(streetLabel('проспект Чуй')).toBe('пр. Чуй');
  });

  it('переводит кыргызские названия из маршрута', () => {
    expect(ruStreet('Исхак Раззаков көчөсү')).toBe('ул. Исхак Раззаков');
    expect(ruStreet('Чүй проспекти')).toBe('пр. Чуй');
    expect(ruStreet('улица Токтогула')).toBe('ул. Токтогула');
  });

  it('убирает кыргызские и английские подписи районов', () => {
    expect(cleanSubtitle('Биринчи май району, Bishkek')).toBe('Бишкек');
    expect(cleanSubtitle('Первомайский район, город Бишкек')).toBe('Первомайский район, Бишкек');
  });
});
