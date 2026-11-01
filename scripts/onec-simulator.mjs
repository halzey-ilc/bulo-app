#!/usr/bin/env node
/**
 * Симулятор 1С: ведёт себя как база «Ярос Групп», чтобы проверить обмен без настоящей 1С.
 *
 *   node scripts/onec-simulator.mjs            — один цикл: выгрузить справочники, забрать и подтвердить документы
 *   node scripts/onec-simulator.mjs --watch    — повторять каждые 30 секунд (как регламентное задание в 1С)
 *   node scripts/onec-simulator.mjs --fail     — «1С» отклоняет документы с ошибкой (проверка журнала ошибок)
 *
 * Переменные: BULO_API (по умолчанию http://localhost:4000/api), ONEC_API_KEY (как в apps/api/.env).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.BULO_API ?? 'http://localhost:4000/api';
const KEY = process.env.ONEC_API_KEY ?? readKeyFromEnvFile();
const WATCH = process.argv.includes('--watch');
const FAIL = process.argv.includes('--fail');

function readKeyFromEnvFile() {
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../apps/api/.env'), 'utf8');
    return env.match(/^ONEC_API_KEY=(.*)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.message ?? ''}`);
  return data;
}

// «Справочники 1С». Коды совпадают с демо-данными, плюс новый товар и контрагент — чтобы было видно, что импорт создаёт записи.
const NOMENCLATURE = {
  groups: [
    { id: 'demo-cat-cinnabon', name: 'Синнабоны' },
    { id: 'demo-cat-bakery', name: 'Выпечка' },
  ],
  items: [
    { id: 'demo-p1', name: 'Синнабон классический', groupId: 'demo-cat-cinnabon', unit: 'шт', multiplicity: 6 },
    { id: '1c-new-001', name: 'Синнабон с фисташкой (из 1С)', groupId: 'demo-cat-cinnabon', unit: 'шт', multiplicity: 6, weight: '130 г', shelfLife: '48 часов' },
  ],
};
const PRICE_TYPES = {
  items: [
    { id: 'demo-base', name: 'Базовая', isDefault: true },
    { id: 'demo-wholesale', name: 'Оптовая' },
    { id: 'demo-retail', name: 'Розничная' },
  ],
};
const PRICES = {
  items: [
    { productId: '1c-new-001', priceTypeId: 'demo-base', price: 240 },
    { productId: '1c-new-001', priceTypeId: 'demo-wholesale', price: 216 },
    { productId: '1c-new-001', priceTypeId: 'demo-retail', price: 290 },
  ],
};
const COUNTERPARTIES = {
  items: [
    { id: 'demo-cp-1', name: 'Кофейня «Утро»', inn: '01234567890123', address: 'г. Бишкек, ул. Киевская, 95' },
    { id: '1c-cp-100', name: 'ИП Садыкова (кофейня «Тёплый угол»)', inn: '20112199000123', address: 'г. Бишкек, пр. Чуй, 150' },
  ],
};

const DOC_NAMES = {
  CUSTOMER_ORDER: 'Заказ клиента',
  PRODUCTION: 'Заказ на производство',
  SALE: 'Реализация товаров и услуг',
};
const PREFIX = { CUSTOMER_ORDER: 'ЗК', PRODUCTION: 'ЗП', SALE: 'РТУ' };
let counter = 1;

async function cycle() {
  const stamp = new Date().toLocaleTimeString('ru-RU');
  console.log(`\n[${stamp}] 1С → BULO: справочники`);
  const n = await call('POST', '/onec/import/nomenclature', NOMENCLATURE);
  console.log(`  номенклатура: ${n.items} позиций, новых ${n.created}`);
  await call('POST', '/onec/import/price-types', PRICE_TYPES);
  console.log(`  типы цен: ${PRICE_TYPES.items.length}`);
  const p = await call('POST', '/onec/import/prices', PRICES);
  console.log(`  цены: ${p.items}${p.skipped.length ? `, пропущено ${p.skipped.length}` : ''}`);
  await call('POST', '/onec/import/counterparties', COUNTERPARTIES);
  console.log(`  контрагенты: ${COUNTERPARTIES.items.length}`);

  console.log(`[${stamp}] BULO → 1С: документы`);
  const docs = await call('GET', '/onec/outbox?limit=50');
  if (!docs.length) console.log('  новых документов нет');
  for (const d of docs) {
    const p = d.payload;
    const what =
      d.type === 'PRODUCTION'
        ? `накладная цеха №${p.sheetNumber} на ${p.date}${p.isSupplement ? ' (дозаказ)' : ''}, позиций ${p.items.length}`
        : `заказ BULO №${p.orderNumber}, ${p.counterparty.name}${p.counterparty.oneCId ? '' : ' (контрагент не сопоставлен!)'}, ${p.total} сом`;
    if (FAIL) {
      await call('POST', `/onec/outbox/${d.id}/ack`, { ok: false, error: 'Симуляция ошибки: не найден склад' });
      console.log(`  ✗ ${DOC_NAMES[d.type]}: ${what} — отклонён`);
    } else {
      const number = `${PREFIX[d.type]}-${String(counter++).padStart(6, '0')}`;
      await call('POST', `/onec/outbox/${d.id}/ack`, { ok: true, number });
      console.log(`  ✓ ${DOC_NAMES[d.type]} ${number}: ${what}`);
    }
  }
}

if (!KEY) {
  console.error('Не найден ONEC_API_KEY (apps/api/.env или переменная окружения)');
  process.exit(1);
}
console.log(`Симулятор 1С → ${API}${FAIL ? ' (режим ошибок)' : ''}`);
try {
  await cycle();
} catch (e) {
  console.error(`Ошибка обмена: ${e.message}`);
  if (!WATCH) process.exit(1);
}
if (WATCH) {
  setInterval(() => cycle().catch((e) => console.error(`Ошибка обмена: ${e.message}`)), 30_000);
}
