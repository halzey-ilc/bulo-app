/**
 * Загрузка каталога BULO из prisma/catalog/bulo-catalog.json: категории, товары, фото и партнёрские цены.
 *
 *   npm run catalog:import -w @bulo/api
 *
 * Можно запускать повторно: товары находятся по названию, фото перезаписываются, цены обновляются.
 * - Партнёрская цена ставится во все типы цен, кроме розничного. Розничные цены задаёт кассир.
 * - Товар без партнёрской цены загружается скрытым.
 * - Демо-товары (oneCId «demo-…») и всё, чего нет в файле, скрываются. Товары не удаляются: на них ссылаются заказы.
 * - Товары из 1С (с oneCId не «demo-») не скрываются и не переименовываются, только получают фото и цены при совпадении названия.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

interface CatalogFile {
  categories: { name: string; workshopArea?: string }[];
  products: {
    key: string;
    category: string;
    name: string;
    description?: string;
    composition?: string;
    partnerPrice: number | null;
    photo: string | null;
    unit?: string;
    multiplicity?: number;
  }[];
}

const prisma = new PrismaClient();
const CATALOG_DIR = join(__dirname, 'catalog');
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const publicUrl = (file: string) => `${process.env.PUBLIC_URL ?? ''}/uploads/${file}`;
const isDemo = (oneCId: string | null) => !!oneCId && oneCId.startsWith('demo-');
const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

async function main() {
  const file: CatalogFile = JSON.parse(readFileSync(join(CATALOG_DIR, 'bulo-catalog.json'), 'utf8'));
  mkdirSync(UPLOAD_DIR, { recursive: true });

  // Розничный тип цен не трогаем: эти цены ведёт кассир
  const priceTypes = await prisma.priceType.findMany();
  const partnerTypes = priceTypes.filter((t) => t.oneCId !== 'demo-retail' && norm(t.name) !== 'розничная');
  if (!partnerTypes.length) throw new Error('Нет типов цен для партнёров. Сначала запустите prisma db seed');

  // Категории — по названию
  const categoryIds = new Map<string, string>();
  const allCategories = await prisma.category.findMany();
  for (const [sortOrder, c] of file.categories.entries()) {
    const found = allCategories.find((x) => norm(x.name) === norm(c.name));
    const data = { name: c.name, workshopArea: c.workshopArea ?? null, sortOrder, visible: true };
    const cat = found
      ? await prisma.category.update({ where: { id: found.id }, data })
      : await prisma.category.create({ data });
    categoryIds.set(c.name, cat.id);
  }

  // Товары — по названию, демо-товары не переиспользуем
  const existing = await prisma.product.findMany();
  const touched = new Set<string>();
  const sortInCategory = new Map<string, number>();
  let created = 0;
  let updated = 0;
  for (const p of file.products) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`«${p.name}»: нет категории «${p.category}» в списке категорий`);
    const sortOrder = sortInCategory.get(categoryId) ?? 0;
    sortInCategory.set(categoryId, sortOrder + 1);

    let photoUrl: string | undefined;
    if (p.photo) {
      const target = `bulo-${p.photo}`;
      copyFileSync(join(CATALOG_DIR, 'photos', p.photo), join(UPLOAD_DIR, target));
      photoUrl = publicUrl(target);
    }

    const match = existing.find((x) => !isDemo(x.oneCId) && !touched.has(x.id) && norm(x.name) === norm(p.name));
    const fields = {
      categoryId,
      description: p.description ?? null,
      composition: p.composition ?? null,
      unit: p.unit ?? 'шт',
      multiplicity: p.multiplicity ?? 1,
      sortOrder,
      visible: p.partnerPrice != null,
      ...(photoUrl ? { photoUrl } : {}),
    };
    const product = match
      ? await prisma.product.update({ where: { id: match.id }, data: fields })
      : await prisma.product.create({ data: { ...fields, name: p.name } });
    match ? updated++ : created++;
    touched.add(product.id);

    if (p.partnerPrice != null) {
      for (const t of partnerTypes) {
        await prisma.price.upsert({
          where: { productId_priceTypeId: { productId: product.id, priceTypeId: t.id } },
          create: { productId: product.id, priceTypeId: t.id, price: p.partnerPrice },
          update: { price: p.partnerPrice },
        });
      }
    }
  }

  // Всё, чего нет в файле, кроме товаров из 1С, — скрыть
  const hidden = await prisma.product.updateMany({
    where: {
      id: { notIn: [...touched] },
      OR: [{ oneCId: null }, { oneCId: { startsWith: 'demo-' } }],
    },
    data: { visible: false },
  });
  const keepCategories = [...categoryIds.values()];
  const withVisible = await prisma.product.findMany({ where: { visible: true }, select: { categoryId: true } });
  const busy = new Set([...keepCategories, ...withVisible.map((x) => x.categoryId)]);
  const hiddenCats = await prisma.category.updateMany({ where: { id: { notIn: [...busy] } }, data: { visible: false } });

  console.log(
    `Каталог загружен: создано ${created}, обновлено ${updated}, скрыто старых товаров ${hidden.count}, ` +
      `скрыто пустых категорий ${hiddenCats.count}. Партнёрские цены записаны в типы: ${partnerTypes.map((t) => t.name).join(', ')}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
