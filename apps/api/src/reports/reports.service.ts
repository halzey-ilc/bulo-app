import { BadRequestException, Injectable } from '@nestjs/common';
import { ORDER_STATUS_LABELS } from '@bulo/shared';
import { addDays, fromDbDate, isIsoDate, localNow, toDbDate } from '../common/dates';
import { ExcelService } from '../common/excel.service';
import { PrismaService } from '../common/prisma.service';
import { buyerName } from '../orders/order-dto';
import { CONFIRMED_STATUSES } from '../orders/order-rules';

/** Выручкой считаем подтверждённые (оплаченные или принятые за наличные) и не отменённые заказы. */
const SOLD = CONFIRMED_STATUSES;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Bucket {
  orders: number;
  total: number;
  paid: number;
}
const bucket = (): Bucket => ({ orders: 0, total: 0, paid: 0 });
const add = (b: Bucket, sum: number, paid: boolean) => {
  b.orders++;
  b.total += sum;
  if (paid) b.paid += sum;
};
const round = (b: Bucket) => ({ orders: b.orders, total: r2(b.total), paid: r2(b.paid), unpaid: r2(b.total - b.paid) });

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  private range(from: string, to: string) {
    if (!isIsoDate(from) || !isIsoDate(to)) throw new BadRequestException('Укажите период: from и to (ГГГГ-ММ-ДД)');
    return { gte: toDbDate(from), lte: toDbDate(to) };
  }

  /** Продажи за период: итоги, кофейня и партнёры отдельно, по партнёрам, филиалам, товарам, дням. */
  async sales(from: string, to: string) {
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate: this.range(from, to), status: { in: SOLD } },
      include: { partner: true, branch: true, items: true, createdBy: { select: { name: true } } },
    });
    const byPartner = new Map<string, { partnerId: string; name: string; orders: number; total: number; paid: number }>();
    const byBranch = new Map<string, { branchId: string; name: string } & Bucket>();
    const byProduct = new Map<string, { productId: string; name: string; unit: string; qty: number; total: number }>();
    const byDay = new Map<string, { date: string; orders: number; total: number; cafe: number; partners: number }>();
    const all = bucket();
    const cafe = bucket();
    const partners = bucket();
    let discount = 0;
    let freeCoffees = 0;

    for (const o of orders) {
      const sum = Number(o.total);
      const isPaid = !!o.paidAt;
      add(all, sum, isPaid);
      if (o.channel === 'CAFE') {
        add(cafe, sum, isPaid);
        discount += Number(o.discount);
        freeCoffees += o.freeCoffees;
        const key = o.branchId ?? '—';
        const b = byBranch.get(key) ?? { branchId: key, name: o.branch?.name ?? 'Кофейня', ...bucket() };
        add(b, sum, isPaid);
        byBranch.set(key, b);
      } else {
        add(partners, sum, isPaid);
        const key = o.partnerId ?? '—';
        const p = byPartner.get(key) ?? { partnerId: key, name: buyerName(o), orders: 0, total: 0, paid: 0 };
        p.orders++;
        p.total += sum;
        if (isPaid) p.paid += sum;
        byPartner.set(key, p);
      }

      const day = fromDbDate(o.deliveryDate);
      const d = byDay.get(day) ?? { date: day, orders: 0, total: 0, cafe: 0, partners: 0 };
      d.orders++;
      d.total += sum;
      if (o.channel === 'CAFE') d.cafe += sum;
      else d.partners += sum;
      byDay.set(day, d);

      for (const i of o.items) {
        const pr = byProduct.get(i.productId) ?? { productId: i.productId, name: i.name, unit: i.unit, qty: 0, total: 0 };
        pr.qty += Number(i.qty);
        // подаренный по акции кофе выручкой не считаем
        pr.total += Number(i.sum) - i.freeQty * Number(i.price);
        byProduct.set(i.productId, pr);
      }
    }
    const totals = round(all);
    return {
      from,
      to,
      totals,
      channels: {
        cafe: { ...round(cafe), discount: r2(discount), freeCoffees },
        partners: round(partners),
      },
      byBranch: [...byBranch.values()].map((b) => ({ branchId: b.branchId, name: b.name, ...round(b) })).sort((a, b) => b.total - a.total),
      byPartner: [...byPartner.values()]
        .map((p) => ({ ...p, total: r2(p.total), paid: r2(p.paid), debt: r2(p.total - p.paid) }))
        .sort((a, b) => b.total - a.total),
      byProduct: [...byProduct.values()]
        .map((p) => ({ ...p, qty: Math.round(p.qty * 1000) / 1000, total: r2(p.total) }))
        .sort((a, b) => b.total - a.total),
      byDay: [...byDay.values()]
        .map((d) => ({ ...d, total: r2(d.total), cafe: r2(d.cafe), partners: r2(d.partners) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Выручка для главного экрана админа: сегодня, 7 дней, месяц — кофейня и партнёры отдельно. */
  async revenue() {
    const today = localNow().date;
    const periods = {
      today: [today, today],
      week: [addDays(today, -6), today],
      month: [`${today.slice(0, 8)}01`, today],
    } as const;
    const out: Record<string, unknown> = {};
    for (const [key, [from, to]] of Object.entries(periods)) {
      const s = await this.sales(from, to);
      out[key] = { from, to, total: s.totals.total, orders: s.totals.orders, cafe: s.channels.cafe, partners: s.channels.partners, byBranch: s.byBranch };
    }
    const [awaiting, claimed] = await Promise.all([
      this.prisma.order.count({ where: { status: 'NEW', confirmedAt: null } }),
      this.prisma.order.count({ where: { status: 'NEW', confirmedAt: null, paymentClaimedAt: { not: null } } }),
    ]);
    return { ...out, awaiting, claimed };
  }

  /** Кто должен: подтверждённые, но не оплаченные заказы (наличные при доставке). */
  async debts() {
    const orders = await this.prisma.order.findMany({
      // долг — это подтверждённый, но не оплаченный заказ; неподтверждённые ещё ждут оплаты
      where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, paidAt: null, confirmedAt: { not: null } },
      include: { partner: true, createdBy: { select: { name: true, phone: true } } },
      orderBy: { deliveryDate: 'asc' },
    });
    return orders.map((o) => ({
      orderId: o.id,
      number: o.number,
      channel: o.channel,
      status: o.status,
      paymentMethod: o.paymentMethod,
      claimedAt: o.paymentClaimedAt,
      partnerId: o.partnerId,
      partner: buyerName(o),
      phone: o.partner?.phone ?? o.createdBy.phone,
      deliveryDate: fromDbDate(o.deliveryDate),
      total: Number(o.total),
    }));
  }

  async salesXlsx(from: string, to: string) {
    const r = await this.sales(from, to);
    const heading = [
      `Продажи BULO за ${from} — ${to}`,
      `Всего: ${r.totals.total} сом · кофейня ${r.channels.cafe.total} · партнёры ${r.channels.partners.total}`,
    ];
    const buffer = await this.excel.build([
      {
        name: 'Кофейня и партнёры',
        heading,
        columns: [
          { header: 'Канал', key: 'name', width: 32 },
          { header: 'Заказов', key: 'orders', width: 10, kind: 'qty' },
          { header: 'Сумма', key: 'total', width: 14, kind: 'money' },
          { header: 'Оплачено', key: 'paid', width: 14, kind: 'money' },
          { header: 'Не оплачено', key: 'unpaid', width: 14, kind: 'money' },
        ],
        rows: [
          ...r.byBranch.map((b) => ({ ...b, name: `Кофейня: ${b.name}` })),
          { name: 'Партнёры', ...r.channels.partners },
        ],
        totals: { name: 'Итого', orders: r.totals.orders, total: r.totals.total, paid: r.totals.paid, unpaid: r.totals.unpaid },
      },
      {
        name: 'По партнёрам',
        heading,
        columns: [
          { header: 'Партнёр', key: 'name', width: 32 },
          { header: 'Заказов', key: 'orders', width: 10, kind: 'qty' },
          { header: 'Сумма', key: 'total', width: 14, kind: 'money' },
          { header: 'Оплачено', key: 'paid', width: 14, kind: 'money' },
          { header: 'Долг', key: 'debt', width: 14, kind: 'money' },
        ],
        rows: r.byPartner,
      },
      {
        name: 'По товарам',
        heading,
        columns: [
          { header: 'Товар', key: 'name', width: 36 },
          { header: 'Ед.', key: 'unit', width: 8 },
          { header: 'Количество', key: 'qty', width: 12, kind: 'qty' },
          { header: 'Сумма', key: 'total', width: 14, kind: 'money' },
        ],
        rows: r.byProduct,
      },
      {
        name: 'По дням',
        heading,
        columns: [
          { header: 'Дата', key: 'date', width: 14 },
          { header: 'Заказов', key: 'orders', width: 10, kind: 'qty' },
          { header: 'Кофейня', key: 'cafe', width: 14, kind: 'money' },
          { header: 'Партнёры', key: 'partners', width: 14, kind: 'money' },
          { header: 'Всего', key: 'total', width: 14, kind: 'money' },
        ],
        rows: r.byDay,
      },
    ]);
    return { filename: `bulo-sales-${from}_${to}.xlsx`, buffer };
  }

  /** Реестр заказов за период со всеми позициями. */
  async ordersXlsx(from: string, to: string) {
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate: this.range(from, to) },
      include: { partner: true, branch: true, items: true, createdBy: { select: { name: true } } },
      orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
    });
    const rows = orders.flatMap((o) =>
      o.items.map((i) => ({
        number: o.number,
        channel: o.channel === 'CAFE' ? `Кофейня ${o.branch?.name ?? ''}` : 'Партнёр',
        date: fromDbDate(o.deliveryDate),
        partner: buyerName(o),
        inn: o.partner?.inn ?? '',
        status: ORDER_STATUS_LABELS[o.status],
        payment: o.paymentMethod ?? '',
        paid: o.paidAt ? 'да' : 'нет',
        name: i.name,
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        sum: Number(i.sum) - i.freeQty * Number(i.price),
      })),
    );
    const buffer = await this.excel.build([
      {
        name: 'Заказы',
        heading: [`Заказы BULO за ${from} — ${to}`],
        columns: [
          { header: '№ заказа', key: 'number', width: 10 },
          { header: 'Канал', key: 'channel', width: 18 },
          { header: 'Дата', key: 'date', width: 14 },
          { header: 'Покупатель', key: 'partner', width: 28 },
          { header: 'ИНН', key: 'inn', width: 16 },
          { header: 'Статус', key: 'status', width: 20 },
          { header: 'Оплата', key: 'payment', width: 10 },
          { header: 'Оплачен', key: 'paid', width: 10 },
          { header: 'Товар', key: 'name', width: 32 },
          { header: 'Ед.', key: 'unit', width: 8 },
          { header: 'Кол-во', key: 'qty', width: 10, kind: 'qty' },
          { header: 'Цена', key: 'price', width: 12, kind: 'money' },
          { header: 'Сумма', key: 'sum', width: 14, kind: 'money' },
        ],
        rows,
      },
    ]);
    return { filename: `bulo-orders-${from}_${to}.xlsx`, buffer };
  }
}
