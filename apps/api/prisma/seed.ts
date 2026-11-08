/**
 * Начальные данные: администратор, настройки, типы цен.
 * С SEED_DEMO=true — ещё демо-каталог, партнёр и сотрудники всех ролей для проверки.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const login = (process.env.ADMIN_LOGIN ?? 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'change-me';
  await prisma.user.upsert({
    where: { login },
    create: {
      login,
      passwordHash: await bcrypt.hash(password, 10),
      phone: process.env.ADMIN_PHONE || null,
      name: 'Администратор',
      role: 'ADMIN',
    },
    update: {},
  });

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      cutoffTime: '16:00',
      minOrderSum: 3000,
      companyName: 'BULO',
      phone: '+996 700 000 000',
      address: 'г. Бишкек',
      workHours: 'Ежедневно 08:00–21:00',
      instagram: 'bulo.kg',
    },
    update: {},
  });

  const base = await prisma.priceType.upsert({
    where: { oneCId: 'demo-base' },
    create: { oneCId: 'demo-base', name: 'Базовая', isDefault: true },
    update: {},
  });
  const wholesale = await prisma.priceType.upsert({
    where: { oneCId: 'demo-wholesale' },
    create: { oneCId: 'demo-wholesale', name: 'Оптовая', isDefault: false },
    update: {},
  });
  // Розничные цены — для клиентов-покупателей (личные кабинеты создаёт админ)
  const retail = await prisma.priceType.upsert({
    where: { oneCId: 'demo-retail' },
    create: { oneCId: 'demo-retail', name: 'Розничная', isDefault: false, isRetail: true },
    update: {},
  });

  if (process.env.SEED_DEMO !== 'true') return;

  const catalog: {
    id: string;
    name: string;
    area: string;
    products: [string, string, string, number, number][];
  }[] = [
    {
      id: 'demo-cat-cinnabon',
      name: 'Синнабоны',
      area: 'Выпечка',
      products: [
        ['demo-p1', 'Синнабон классический', 'Мягкая булочка с корицей и сливочным кремом', 6, 180],
        ['demo-p2', 'Синнабон шоколадный', 'С какао, шоколадным соусом и крем-чизом', 6, 210],
        ['demo-p3', 'Синнабон карамельный', 'Солёная карамель и пекан', 6, 220],
        ['demo-p4', 'Мини-синнабоны', 'Набор из 12 мини-булочек', 1, 950],
      ],
    },
    {
      id: 'demo-cat-bakery',
      name: 'Выпечка',
      area: 'Выпечка',
      products: [
        ['demo-p5', 'Круассан сливочный', 'Слоёное тесто на сливочном масле 82%', 10, 120],
        ['demo-p6', 'Круассан миндальный', 'С миндальным кремом и лепестками', 10, 160],
        ['demo-p7', 'Улитка с изюмом', 'Слойка с заварным кремом и изюмом', 10, 110],
      ],
    },
    {
      id: 'demo-cat-cakes',
      name: 'Торты',
      area: 'Кондитерский цех',
      products: [
        ['demo-p8', 'Медовик', 'Целый торт 1,2 кг', 1, 1800],
        ['demo-p9', 'Наполеон', 'Целый торт 1,2 кг', 1, 1900],
      ],
    },
    {
      id: 'demo-cat-sandwich',
      name: 'Сэндвичи',
      area: 'Холодный цех',
      products: [
        ['demo-p10', 'Сэндвич с курицей', 'Чиабатта, курица су-вид, песто', 5, 260],
        ['demo-p11', 'Сэндвич с лососем', 'Багет, слабосолёный лосось, крем-чиз', 5, 340],
      ],
    },
  ];

  for (const [sort, c] of catalog.entries()) {
    const cat = await prisma.category.upsert({
      where: { oneCId: c.id },
      create: { oneCId: c.id, name: c.name, workshopArea: c.area, sortOrder: sort },
      update: {},
    });
    for (const [i, [id, name, description, multiplicity, price]] of c.products.entries()) {
      const p = await prisma.product.upsert({
        where: { oneCId: id },
        create: {
          oneCId: id,
          name,
          description,
          categoryId: cat.id,
          multiplicity,
          composition: 'Мука, сливочное масло, сахар, яйца, молоко',
          weight: '120 г',
          shelfLife: '48 часов',
          sortOrder: i,
          isNew: i === 0,
        },
        update: {},
      });
      await prisma.price.upsert({
        where: { productId_priceTypeId: { productId: p.id, priceTypeId: base.id } },
        create: { productId: p.id, priceTypeId: base.id, price },
        update: {},
      });
      await prisma.price.upsert({
        where: { productId_priceTypeId: { productId: p.id, priceTypeId: wholesale.id } },
        create: { productId: p.id, priceTypeId: wholesale.id, price: Math.round(price * 0.9) },
        update: {},
      });
      await prisma.price.upsert({
        where: { productId_priceTypeId: { productId: p.id, priceTypeId: retail.id } },
        create: { productId: p.id, priceTypeId: retail.id, price: Math.round(price * 1.2) },
        update: {},
      });
    }
  }

  await prisma.oneCCounterparty.upsert({
    where: { oneCId: 'demo-cp-1' },
    create: { oneCId: 'demo-cp-1', name: 'Кофейня «Утро»', inn: '01234567890123', address: 'г. Бишкек, ул. Киевская, 95' },
    update: {},
  });

  const partner = await prisma.partner.upsert({
    where: { oneCId: 'demo-cp-1' },
    create: {
      oneCId: 'demo-cp-1',
      name: 'Кофейня «Утро»',
      inn: '01234567890123',
      contactName: 'Айгерим',
      phone: '+996700111111',
      status: 'APPROVED',
      approvedAt: new Date(),
      priceTypeId: wholesale.id,
      addresses: {
        create: { address: 'г. Бишкек, ул. Киевская, 95', lat: 42.8771, lng: 74.6048, entrance: 'Вход со двора', isDefault: true },
      },
    },
    update: {},
  });

  const client = await prisma.partner.upsert({
    where: { oneCId: 'demo-client-1' },
    create: {
      oneCId: 'demo-client-1',
      name: 'Жаныл Асанова',
      contactName: 'Жаныл Асанова',
      phone: '+996700666666',
      status: 'APPROVED',
      approvedAt: new Date(),
      priceTypeId: retail.id,
      note: 'Личный кабинет клиента',
      addresses: {
        create: { address: 'г. Бишкек, мкр. Асанбай, 12', lat: 42.8213, lng: 74.6281, entrance: 'Подъезд 2, этаж 5, кв. 34', isDefault: true },
      },
    },
    update: {},
  });

  // Демо-учётки: вход по телефону (код из СМС) или по логину и общему паролю
  const demoPassword = await bcrypt.hash('bulo2026', 10);
  const demoUsers: { phone: string; login: string; name: string; role: Role; partnerId?: string }[] = [
    { phone: '+996700111111', login: 'partner', name: 'Айгерим (партнёр)', role: 'PARTNER', partnerId: partner.id },
    { phone: '+996700222222', login: 'manager', name: 'Менеджер', role: 'MANAGER' },
    { phone: '+996700333333', login: 'accountant', name: 'Бухгалтер', role: 'ACCOUNTANT' },
    { phone: '+996700444444', login: 'workshop', name: 'Цех', role: 'WORKSHOP' },
    { phone: '+996700555555', login: 'courier', name: 'Курьер', role: 'COURIER' },
    { phone: '+996700777777', login: 'cashier', name: 'Кассир', role: 'CASHIER' },
    { phone: '+996700666666', login: 'client', name: 'Жаныл', role: 'CLIENT', partnerId: client.id },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: { ...u, passwordHash: demoPassword },
      update: { login: u.login, passwordHash: demoPassword },
    });
  }
  await prisma.user.upsert({
    where: { login: 'guest' },
    create: {
      login: 'guest',
      passwordHash: await bcrypt.hash('guest123', 10),
      name: 'Гость',
      role: 'GUEST',
    },
    update: {},
  });
}

main()
  .then(() => console.log('Seed: готово'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
