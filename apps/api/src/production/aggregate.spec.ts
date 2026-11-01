import { aggregateForProduction, AggregateLine } from './aggregate';

const line = (over: Partial<AggregateLine>): AggregateLine => ({
  productId: 'p1',
  productOneCId: null,
  name: 'Синнабон классический',
  unit: 'шт',
  qty: 6,
  category: 'Синнабоны',
  categorySort: 1,
  workshopArea: 'Выпечка',
  ...over,
});

describe('aggregateForProduction', () => {
  it('складывает одинаковые товары из разных заказов', () => {
    const res = aggregateForProduction([line({ qty: 6 }), line({ qty: 12 })]);
    expect(res).toEqual([
      { area: 'Выпечка', items: [expect.objectContaining({ productId: 'p1', qty: 18 })] },
    ]);
  });

  it('группирует по участку, а без участка — по категории', () => {
    const res = aggregateForProduction([
      line({}),
      line({ productId: 'p2', name: 'Торт Наполеон', category: 'Торты', categorySort: 2, workshopArea: 'Кондитерский цех' }),
      line({ productId: 'p3', name: 'Сэндвич', category: 'Сэндвичи', categorySort: 3, workshopArea: null }),
    ]);
    expect(res.map((g) => g.area)).toEqual(['Выпечка', 'Кондитерский цех', 'Сэндвичи']);
  });

  it('не теряет дробные количества', () => {
    const res = aggregateForProduction([line({ qty: 0.1, unit: 'кг' }), line({ qty: 0.2, unit: 'кг' })]);
    expect(res[0].items[0].qty).toBe(0.3);
  });
});
