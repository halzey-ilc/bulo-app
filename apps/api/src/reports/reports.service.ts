import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ORDER_STATUS_LABELS } from '@bulo/shared';
import { fromDbDate, isIsoDate, toDbDate } from '../common/dates';
import { ExcelService } from '../common/excel.service';
import { PrismaService } from '../common/prisma.service';

/** Продажей считаем всё, что одобрено и не отменено. */
const SOLD: OrderStatus[] = ['APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];

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

  /** Продажи за период: итоги, по партнёрам, по товарам, по дням. */
  async sales(from: string, to: string) {
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate: this.range(from, to), status: { in: SOLD } },
      include: { partner: true, items: true },
    });
    const byPartner = new Map<string, { partnerId: string; name: string; orders: number; total: number; paid: number }>();
    const byProduct = new Map<string, { productId: string; name: string; unit: string; qty: number; total: number }>();
    const byDay = new Map<string, { date: string; orders: number; total: number }>();
    let total = 0;
    let paid = 0;

    for (const o of orders) {
      const sum = Number(o.total);
      const isPaid = !!o.paidAt;
      total += sum;
      if (isPaid) paid += sum;

      const p = byPartner.get(o.partnerId) ?? { partnerId: o.partnerId, name: o.partner.name, orders: 0, total: 0, paid: 0 };
      p.orders++;
      p.total += sum;
      if (isPaid) p.paid += sum;
      byPartner.set(o.partnerId, p);

      const day = fromDbDate(o.deliveryDate);
      const d = byDay.get(day) ?? { date: day, orders: 0, total: 0 };
      d.orders++;
      d.total += sum;
      byDay.set(day, d);

      for (const i of o.items) {
        const pr = byProduct.get(i.productId) ?? { productId: i.productId, name: i.name, unit: i.unit, qty: 0, total: 0 };
        pr.qty += Number(i.qty);
        pr.total += Number(i.sum);
        byProduct.set(i.productId, pr);
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      from,
      to,
      totals: { orders: orders.length, total: r2(total), paid: r2(paid), unpaid: r2(total - paid) },
      byPartner: [...byPartner.values()]
        .map((p) => ({ ...p, total: r2(p.total), paid: r2(p.paid), debt: r2(p.total - p.paid) }))
        .sort((a, b) => b.total - a.total),
      byProduct: [...byProduct.values()]
        .map((p) => ({ ...p, qty: Math.round(p.qty * 1000) / 1000, total: r2(p.total) }))
        .sort((a, b) => b.total - a.total),
      byDay: [...byDay.values()].map((d) => ({ ...d, total: r2(d.total) })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Кто должен: одобренные, но не оплаченные заказы. */
  async debts() {
    const orders = await this.prisma.order.findMany({
      where: { status: 'APPROVED', paidAt: null },
      include: { partner: true },
      orderBy: { deliveryDate: 'asc' },
    });
    return orders.map((o) => ({
      orderId: o.id,
      number: o.number,
      partnerId: o.partnerId,
      partner: o.partner.name,
      phone: o.partner.phone,
      deliveryDate: fromDbDate(o.deliveryDate),
      total: Number(o.total),
    }));
  }

  async salesXlsx(from: string, to: string) {
    const r = await this.sales(from, to);
    const heading = [`Продажи BULO за ${from} — ${to}`, `Заказов: ${r.totals.orders}, сумма: ${r.totals.total} сом`];
    const buffer = await this.excel.build([
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
        totals: { name: 'Итого', orders: r.totals.orders, total: r.totals.total, paid: r.totals.paid, debt: r.totals.unpaid },
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
          { header: 'Сумма', key: 'total', width: 14, kind: 'money' },
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
      include: { partner: true, items: true },
      orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
    });
    const rows = orders.flatMap((o) =>
      o.items.map((i) => ({
        number: o.number,
        date: fromDbDate(o.deliveryDate),
        partner: o.partner.name,
        inn: o.partner.inn ?? '',
        status: ORDER_STATUS_LABELS[o.status],
        paid: o.paidAt ? 'да' : 'нет',
        name: i.name,
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        sum: Number(i.sum),
      })),
    );
    const buffer = await this.excel.build([
      {
        name: 'Заказы',
        heading: [`Заказы BULO за ${from} — ${to}`],
        columns: [
          { header: '№ заказа', key: 'number', width: 10 },
          { header: 'Дата доставки', key: 'date', width: 14 },
          { header: 'Партнёр', key: 'partner', width: 28 },
          { header: 'ИНН', key: 'inn', width: 16 },
          { header: 'Статус', key: 'status', width: 20 },
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
