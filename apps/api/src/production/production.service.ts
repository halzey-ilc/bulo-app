import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { fromDbDate, isIsoDate, toDbDate } from '../common/dates';
import { ExcelService, ExcelSheet } from '../common/excel.service';
import { PrismaService } from '../common/prisma.service';
import { OutboxService } from '../onec/outbox.service';
import { AWAITING_PRODUCTION } from '../orders/order-rules';
import { OrdersService } from '../orders/orders.service';
import { aggregateForProduction, AggregateLine } from './aggregate';

const lineInclude = {
  partner: true,
  items: { include: { product: { include: { category: true } } } },
} satisfies Prisma.OrderInclude;
type OrderWithLines = Prisma.OrderGetPayload<{ include: typeof lineInclude }>;

/** Статусы, по которым печатаются накладные на отгрузку. */
const SHIPPABLE: OrderStatus[] = ['PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];

function toLines(orders: OrderWithLines[]): AggregateLine[] {
  return orders.flatMap((o) =>
    o.items.map((i) => ({
      productId: i.productId,
      productOneCId: i.product.oneCId,
      name: i.name,
      unit: i.unit,
      qty: Number(i.qty),
      category: i.product.category.name,
      categorySort: i.product.category.sortOrder,
      workshopArea: i.product.category.workshopArea,
    })),
  );
}

function orderBrief(o: OrderWithLines) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    partner: o.partner.name,
    total: Number(o.total),
    deliveryAddress: o.deliveryAddress,
  };
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly excel: ExcelService,
  ) {}

  private date(d: string) {
    if (!d || !isIsoDate(d)) throw new BadRequestException('Укажите дату в формате ГГГГ-ММ-ДД');
    return toDbDate(d);
  }

  /** Что войдёт в накладную (принятые, ещё не в цеху) и какие накладные уже сформированы на дату. */
  async summary(date: string) {
    const day = this.date(date);
    const [pending, sheets] = await Promise.all([
      this.prisma.order.findMany({
        where: { deliveryDate: day, status: { in: AWAITING_PRODUCTION }, productionSheetId: null },
        include: lineInclude,
        orderBy: { number: 'asc' },
      }),
      this.prisma.productionSheet.findMany({
        where: { date: day },
        orderBy: { number: 'asc' },
        include: { _count: { select: { orders: true } } },
      }),
    ]);
    const [awaitingPayment, inWork] = await Promise.all([
      this.prisma.order.count({
        where: { deliveryDate: day, paidAt: null, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      }),
      this.prisma.order.findMany({
        where: { deliveryDate: day, status: { in: [...AWAITING_PRODUCTION, 'IN_PRODUCTION', 'READY'] } },
        include: lineInclude,
      }),
    ]);
    return {
      date,
      awaitingPayment,
      pending: { orders: pending.map(orderBrief), groups: aggregateForProduction(toLines(pending)) },
      /** Всё, что печётся на дату: и ещё не переданное в цех, и уже по накладным */
      total: { orders: inWork.length, groups: aggregateForProduction(toLines(inWork)) },
      sheets: sheets.map((s) => ({ ...s, date: fromDbDate(s.date), ordersCount: s._count.orders })),
    };
  }

  /**
   * Формирует сводную накладную по принятым заказам на дату и переводит их в производство.
   * Если на дату уже есть накладная — новая помечается как дозаказ.
   */
  async createSheet(user: AuthUser, date: string) {
    const day = this.date(date);
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate: day, status: { in: AWAITING_PRODUCTION }, productionSheetId: null },
      include: lineInclude,
    });
    if (!orders.length) throw new BadRequestException('Нет новых заказов, которые ещё не переданы в цех');

    const existing = await this.prisma.productionSheet.count({ where: { date: day } });
    const sheet = await this.prisma.productionSheet.create({
      data: { date: day, isSupplement: existing > 0, createdById: user.id },
    });
    for (const o of orders) {
      await this.orders.transition(o.id, 'IN_PRODUCTION', user, {
        productionSheetId: sheet.id,
        comment: `Сводная накладная №${sheet.number}${sheet.isSupplement ? ' (дозаказ)' : ''}`,
      });
    }
    const items = aggregateForProduction(toLines(orders)).flatMap((g) =>
      g.items.map(({ productOneCId, name, unit, qty }) => ({ productOneCId, name, unit, qty })),
    );
    await this.outbox.enqueueProduction(sheet.id, items);
    return this.sheet(sheet.id);
  }

  async sheets(dateFrom?: string, dateTo?: string) {
    const list = await this.prisma.productionSheet.findMany({
      where: {
        date: {
          gte: dateFrom && isIsoDate(dateFrom) ? toDbDate(dateFrom) : undefined,
          lte: dateTo && isIsoDate(dateTo) ? toDbDate(dateTo) : undefined,
        },
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      include: { _count: { select: { orders: true } } },
      take: 100,
    });
    return list.map((s) => ({ ...s, date: fromDbDate(s.date), ordersCount: s._count.orders }));
  }

  async sheet(id: string) {
    const sheet = await this.prisma.productionSheet.findUnique({
      where: { id },
      include: { orders: { include: lineInclude, orderBy: { number: 'asc' } } },
    });
    if (!sheet) throw new NotFoundException('Накладная не найдена');
    const { orders, ...rest } = sheet;
    return {
      ...rest,
      date: fromDbDate(sheet.date),
      orders: orders.map(orderBrief),
      groups: aggregateForProduction(toLines(orders)),
    };
  }

  async sheetXlsx(id: string) {
    const s = await this.sheet(id);
    const title = `Сводная накладная №${s.number}${s.isSupplement ? ' — ДОЗАКАЗ' : ''}`;
    const sheet: ExcelSheet = {
      name: `Накладная ${s.number}`,
      heading: [
        title,
        `Дата производства: ${s.date}`,
        `Заказы: ${s.orders.map((o) => `№${o.number}`).join(', ')}`,
      ],
      columns: [
        { header: 'Участок', key: 'area', width: 22 },
        { header: 'Продукция', key: 'name', width: 40 },
        { header: 'Ед.', key: 'unit', width: 8 },
        { header: 'Количество', key: 'qty', width: 14, kind: 'qty' },
      ],
      rows: s.groups.flatMap((g) => g.items.map((i) => ({ area: g.area, ...i }))),
    };
    return { filename: `bulo-production-${s.date}-${s.number}.xlsx`, buffer: await this.excel.build([sheet]) };
  }

  /** Накладные на отгрузку: по одной на заказ контрагента, отсортированы по адресу доставки. */
  async invoices(date: string) {
    const day = this.date(date);
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate: day, status: { in: SHIPPABLE } },
      include: lineInclude,
    });
    return orders
      .sort((a, b) => a.deliveryAddress.localeCompare(b.deliveryAddress, 'ru') || a.number - b.number)
      .map((o) => ({
        orderId: o.id,
        number: o.number,
        status: o.status,
        date,
        partner: {
          name: o.partner.name,
          inn: o.partner.inn,
          contactName: o.partner.contactName,
          phone: o.partner.phone,
          oneCId: o.partner.oneCId,
        },
        deliveryAddress: o.deliveryAddress,
        comment: o.comment,
        items: o.items.map((i) => ({
          name: i.name,
          unit: i.unit,
          qty: Number(i.qty),
          price: Number(i.price),
          sum: Number(i.sum),
        })),
        total: Number(o.total),
      }));
  }

  async invoicesXlsx(date: string) {
    const list = await this.invoices(date);
    if (!list.length) throw new BadRequestException('На эту дату нет заказов к отгрузке');
    const sheets: ExcelSheet[] = list.map((inv) => ({
      name: `№${inv.number} ${inv.partner.name}`,
      heading: [
        `Накладная на отгрузку №${inv.number} от ${inv.date}`,
        'Поставщик: BULO',
        `Покупатель: ${inv.partner.name}${inv.partner.inn ? `, ИНН ${inv.partner.inn}` : ''}`,
        `Адрес доставки: ${inv.deliveryAddress}`,
        `Контакт: ${inv.partner.contactName}, ${inv.partner.phone}`,
      ],
      columns: [
        { header: '№', key: 'n', width: 5 },
        { header: 'Товар', key: 'name', width: 40 },
        { header: 'Ед.', key: 'unit', width: 8 },
        { header: 'Кол-во', key: 'qty', width: 10, kind: 'qty' },
        { header: 'Цена', key: 'price', width: 12, kind: 'money' },
        { header: 'Сумма', key: 'sum', width: 14, kind: 'money' },
      ],
      rows: inv.items.map((i, n) => ({ n: n + 1, ...i })),
      totals: { name: 'Итого', sum: inv.total },
    }));
    return { filename: `bulo-invoices-${date}.xlsx`, buffer: await this.excel.build(sheets) };
  }
}
