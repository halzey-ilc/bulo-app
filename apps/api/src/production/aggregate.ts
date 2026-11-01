/** Позиция заказа с данными для группировки по участкам цеха. */
export interface AggregateLine {
  productId: string;
  productOneCId: string | null;
  name: string;
  unit: string;
  qty: number;
  category: string;
  categorySort: number;
  workshopArea: string | null;
}

export interface AreaGroup {
  area: string;
  items: { productId: string; productOneCId: string | null; name: string; unit: string; qty: number; category: string }[];
}

/**
 * Сводит позиции всех заказов в «сколько приготовить»: по участкам цеха
 * (или по категории, если участок не задан), внутри — по товарам.
 */
export function aggregateForProduction(lines: AggregateLine[]): AreaGroup[] {
  const areas = new Map<string, { sort: number; items: Map<string, AreaGroup['items'][number]> }>();
  for (const l of lines) {
    const area = l.workshopArea?.trim() || l.category;
    let group = areas.get(area);
    if (!group) {
      group = { sort: l.categorySort, items: new Map() };
      areas.set(area, group);
    }
    group.sort = Math.min(group.sort, l.categorySort);
    const item = group.items.get(l.productId);
    if (item) item.qty = Math.round((item.qty + l.qty) * 1000) / 1000;
    else
      group.items.set(l.productId, {
        productId: l.productId,
        productOneCId: l.productOneCId,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        category: l.category,
      });
  }
  return [...areas.entries()]
    .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b, 'ru'))
    .map(([area, g]) => ({
      area,
      items: [...g.items.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    }));
}
