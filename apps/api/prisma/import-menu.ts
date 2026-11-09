/**
 * Меню кофейни из выгрузки 1С (Excel: Наименование, Цена, Ед. изм., Склад) — в филиал.
 *
 *   npm run menu:import -w @bulo/api -- [файл.xlsx] [филиал]
 *   по умолчанию: prisma/catalog/menu-7mkr.xlsx → «7 мкр»
 *
 * - Строки без цены — заголовки групп: «Бар» → «Горячие напитки» → «Авторские чаи».
 *   Категория в приложении — последняя группа над товаром, раздел — верхняя («Бар», «Кухня»).
 * - Товары находятся по названию внутри меню кофейни, цена пишется в тип цен филиала.
 * - Позиции без цены заводятся, но в меню не показываются, пока менеджер не поставит цену.
 * - Кофе (горячий и холодный) участвует в акции «7-й кофе бесплатно».
 * - Создаёт филиалы «7 мкр» и «Кок-Жар» (у Кок-Жара меню пока пустое — его заполнит менеджер).
 * Можно запускать повторно.
 */
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';

const prisma = new PrismaClient();
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();

/** Названия групп из 1С → как их видит гость. */
const CATEGORY_NAMES: Record<string, string> = {
  'кофе горячее': 'Горячий кофе',
  'кофе холодное': 'Холодный кофе',
  'не кофе': 'Какао и шоколад',
  'блины 7 мкр': 'Блины',
  'круассан/шайба': 'Круассаны и шайбы',
  'печенья/кукисы': 'Печенье и кукисы',
  'сендвичи/панини': 'Сэндвичи и панини',
  'торты/тарты': 'Торты и чизкейки',
  еда: 'Салаты и боулы',
};
const PROMO = new Set(['Горячий кофе', 'Холодный кофе']);

const BRANCHES = [
  { name: '7 мкр', address: '7 микрорайон, Бишкек', lat: 42.8467, lng: 74.5999, sortOrder: 0 },
  { name: 'Кок-Жар', address: 'мкр Кок-Жар, Бишкек', lat: 42.8506, lng: 74.6338, sortOrder: 1 },
];

/** QR Оптима Банка «CINNABON BY MEERIM» (из CINNABON BY MEERIM QR.pdf). */
const OPTIMA_QR =
  'https://optimabank.kg/index.php?lang=ru#00020101021132710013QR.Optima.C2B01032031016109162116378032411112075469%3A3%3A1120211130212331500112075469%3A3%3A15204999953034175918CINNABON%20BY%20MEERIM63043787';

interface Row {
  name: string;
  price: number | null;
  unit: string;
  warehouse: string | null;
}

async function readMenu(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const rows: Row[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = row.values as unknown[];
    const text = (x: unknown) => (x == null ? '' : String(typeof x === 'object' && x && 'result' in x ? (x as { result: unknown }).result : x)).trim();
    const name = text(v[1]).replace(/\s+/g, ' ');
    if (!name) return;
    const priceRaw = v[2];
    const unit = text(v[3]);
    rows.push({
      name,
      price: priceRaw == null || priceRaw === '' ? null : Number(priceRaw),
      unit: unit || '',
      warehouse: text(v[4]) || null,
    });
  });
  // группа = строка без единицы измерения; товар = строка с единицей.
  // Категория — ближайшая группа над товаром, раздел — последняя группа верхнего уровня («Бар», «Кухня»).
  const items: (Row & { category: string; section: string })[] = [];
  let section = 'Меню';
  let leaf = 'Меню';
  for (const r of rows) {
    if (!r.unit) {
      if (TOP.has(norm(r.name))) section = r.name;
      leaf = r.name;
      continue;
    }
    items.push({ ...r, category: CATEGORY_NAMES[norm(leaf)] ?? leaf, section });
  }
  return items;
}
const TOP = new Set(['бар', 'кухня']);

async function main() {
  const file = process.argv[2] ?? join(__dirname, 'catalog', 'menu-7mkr.xlsx');
  const branchName = process.argv[3] ?? '7 мкр';

  // Филиалы и их типы цен
  for (const b of BRANCHES) {
    const found = await prisma.branch.findFirst({ where: { name: b.name } });
    if (found) continue;
    const pt = await prisma.priceType.create({ data: { name: `Кофейня ${b.name}`, isRetail: true } });
    await prisma.branch.create({ data: { ...b, priceTypeId: pt.id } });
  }
  const branch = await prisma.branch.findFirstOrThrow({ where: { name: branchName } });

  const items = await readMenu(file);
  // одинаковые названия: берём строку с ценой
  const unique = new Map<string, (typeof items)[number]>();
  for (const it of items) {
    const key = norm(it.name);
    const prev = unique.get(key);
    if (!prev || (prev.price == null && it.price != null)) unique.set(key, it);
  }

  // Категории меню: по названию внутри меню кофейни (section не пустой)
  const cafeCats = await prisma.category.findMany({ where: { section: { not: null } } });
  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  const catIds = new Map<string, string>();
  let order = 0;
  for (const it of unique.values()) {
    if (catIds.has(it.category)) continue;
    order++;
    const found = cafeCats.find((c) => norm(c.name) === norm(it.category));
    const data = { name: it.category, section: it.section, sortOrder: maxSort + order, visible: true, promoCoffee: PROMO.has(it.category) };
    const c = found ? await prisma.category.update({ where: { id: found.id }, data }) : await prisma.category.create({ data });
    catIds.set(it.category, c.id);
  }

  const existing = await prisma.product.findMany({ where: { category: { section: { not: null } } } });
  const sortIn = new Map<string, number>();
  let created = 0;
  let priced = 0;
  let noPrice = 0;
  for (const it of unique.values()) {
    const categoryId = catIds.get(it.category)!;
    const sortOrder = sortIn.get(categoryId) ?? 0;
    sortIn.set(categoryId, sortOrder + 1);
    const match = existing.find((p) => norm(p.name) === norm(it.name));
    const data = { name: it.name, categoryId, unit: it.unit || 'шт', sortOrder, visible: true };
    const p = match ? await prisma.product.update({ where: { id: match.id }, data }) : await prisma.product.create({ data });
    if (!match) created++;
    if (it.price != null && it.price > 0) {
      await prisma.price.upsert({
        where: { productId_priceTypeId: { productId: p.id, priceTypeId: branch.priceTypeId } },
        create: { productId: p.id, priceTypeId: branch.priceTypeId, price: it.price },
        update: { price: it.price },
      });
      priced++;
    } else {
      noPrice++;
    }
  }

  // QR для оплаты — если ещё не задан
  const s = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  if (!s.qrPayload) await prisma.settings.update({ where: { id: 1 }, data: { qrPayload: OPTIMA_QR, qrWithAmount: false } });

  console.log(
    `Меню «${branch.name}»: позиций ${unique.size} (новых ${created}), с ценой ${priced}, без цены ${noPrice}, категорий ${catIds.size}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
