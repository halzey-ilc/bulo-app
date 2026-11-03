#!/usr/bin/env node
/**
 * Симулятор курьера: едет по маршруту и шлёт геопозицию, как телефон курьера.
 * Нужен, чтобы посмотреть трекинг доставки на карте без реальной поездки.
 *
 *   node scripts/courier-simulator.mjs --prepare   — создать заказ партнёра и довести его до «Готов к отгрузке»
 *   node scripts/courier-simulator.mjs             — забрать готовые заказы и поехать по маршруту
 *   node scripts/courier-simulator.mjs --deliver   — в конце вручить заказы (код берётся у администратора)
 *   --speed=N — во сколько раз быстрее реального времени (по умолчанию 8)
 *
 * Переменные: BULO_API (по умолчанию http://localhost:4000/api).
 */
const API = process.env.BULO_API ?? 'http://localhost:4000/api';
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const SPEED = Number(args.find((a) => a.startsWith('--speed='))?.split('=')[1] ?? 8);
const DEMO_PASSWORD = 'bulo2026';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data?.message ?? data)}`);
  return data;
}
const login = async (l, p = DEMO_PASSWORD) => (await call('POST', '/auth/login', { body: { login: l, password: p } })).token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Демо-заказ партнёра, проведённый через одобрение, оплату и цех до «Готов к отгрузке». */
async function prepare() {
  const partner = await login('partner');
  const products = await call('GET', '/catalog/products', { token: partner });
  const p = products.find((x) => x.price && x.multiplicity === 6) ?? products.find((x) => x.price);
  const rules = await call('GET', '/orders/rules');
  const qty = Math.max(p.multiplicity, Math.ceil(rules.minOrderSum / p.price / p.multiplicity) * p.multiplicity);
  const order = await call('POST', '/orders', {
    token: partner,
    body: { deliveryDate: rules.earliestDeliveryDate, items: [{ productId: p.id, qty }], comment: 'Демо-доставка' },
  });
  const admin = await login('admin', process.env.ADMIN_PASSWORD ?? 'bulo-admin-2026');
  await call('POST', `/orders/${order.id}/status`, { token: admin, body: { status: 'APPROVED' } });
  await call('POST', `/orders/${order.id}/status`, { token: admin, body: { status: 'PAID', paymentMethod: 'демо' } });
  await call('POST', `/orders/${order.id}/status`, { token: admin, body: { status: 'IN_PRODUCTION' } });
  await call('POST', `/orders/${order.id}/status`, { token: admin, body: { status: 'READY' } });
  console.log(`Заказ №${order.number} готов к отгрузке: ${p.name} × ${qty}, ${order.deliveryAddress}`);
}

/** Точки вдоль линии маршрута с шагом ~step метров. */
function densify(line, stepM = 40) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const d = Math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 81_500);
    const n = Math.max(1, Math.round(d / stepM));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

function bearing(a, b) {
  const y = Math.sin(((b[1] - a[1]) * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180);
  const x =
    Math.cos((a[0] * Math.PI) / 180) * Math.sin((b[0] * Math.PI) / 180) -
    Math.sin((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.cos(((b[1] - a[1]) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function drive() {
  const courier = await login('courier');
  await call('POST', '/courier/shift', { token: courier, body: { on: true } });
  let plan = await call('GET', '/courier/route', { token: courier });

  // в пекарне: забираем все готовые заказы
  await call('POST', '/courier/location', { token: courier, body: plan.bakery });
  for (const o of plan.toPickup) {
    await call('POST', `/orders/${o.orderId}/status`, { token: courier, body: { status: 'SHIPPED' } });
    console.log(`Забрал заказ №${o.number} → ${o.address}`);
  }
  plan = await call('GET', '/courier/route', { token: courier });
  if (!plan.stops.length) {
    console.log('Нет заказов в пути. Запустите сначала с --prepare');
    return;
  }
  console.log(
    `Маршрут: ${plan.stops.length} адрес(ов), ${plan.route.totalKm} км, ~${plan.route.totalMinutes} мин` +
      `${plan.route.byRoads ? ' (по дорогам)' : ' (оценка по прямой)'}; ускорение ×${SPEED}`,
  );

  const points = densify(plan.route.geometry);
  const stops = plan.stops.filter((s) => s.point);
  let next = 0;
  // ~40 м за шаг при 25 км/ч ≈ 5.8 с реального времени
  const tick = (5800 / SPEED) | 0;
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i];
    const heading = i > 0 ? bearing(points[i - 1], points[i]) : 0;
    await call('POST', '/courier/location', { token: courier, body: { lat, lng, heading, speed: 6.9, accuracy: 8 } });
    const s = stops[next];
    if (s && Math.hypot((s.point.lat - lat) * 111_000, (s.point.lng - lng) * 81_500) < 35) {
      await call('POST', `/courier/orders/${s.orderId}/arrived`, { token: courier });
      console.log(`На месте: заказ №${s.number}, ${s.address}`);
      if (has('--deliver')) {
        const admin = await login('admin', process.env.ADMIN_PASSWORD ?? 'bulo-admin-2026');
        const t = await call('GET', `/orders/${s.orderId}/tracking`, { token: admin });
        await sleep(tick * 3);
        await call('POST', `/orders/${s.orderId}/status`, {
          token: courier,
          body: { status: 'DELIVERED', code: t.deliveryCode, receivedBy: s.partner.contactName },
        });
        console.log(`Вручил заказ №${s.number} по коду ${t.deliveryCode}`);
      }
      next++;
    }
    if (i % 15 === 0) process.stdout.write(`  ${Math.round((i / points.length) * 100)}%\r`);
    await sleep(tick);
  }
  console.log('Маршрут пройден.');
}

try {
  if (has('--prepare')) await prepare();
  else await drive();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
