import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { ORDER_STATUS_LABELS } from '@bulo/shared';
import { AuditService } from '../common/audit.service';
import { AuthUser, canOrder, isStaff } from '../common/auth-user';
import { isIsoDate, toDbDate } from '../common/dates';
import { NotificationsService } from '../common/notifications.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { OutboxService } from '../onec/outbox.service';
import { CreateOrderDto, OrderItemInput, orderInclude, serializeOrder, StatusDto } from './order-dto';
import {
  allowedTransitions,
  AWAITING_PRODUCTION,
  canTransition,
  checkDeliveryDate,
  checkMultiplicity,
  EDITABLE_STATUSES,
  round2,
} from './order-rules';

export interface OrderFilter {
  status?: OrderStatus | OrderStatus[];
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** true — только оплаченные, false — только неоплаченные */
  paid?: boolean;
}

/** Статусы, в которых курьер видит заказ. */
const COURIER_STATUSES: OrderStatus[] = ['READY', 'SHIPPED', 'DELIVERED'];
/** Статусы, в которых цех видит заказ: всё, что ещё не отгружено. */
const WORKSHOP_STATUSES: OrderStatus[] = [...AWAITING_PRODUCTION, 'IN_PRODUCTION', 'READY'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** Считает позиции по ценам контрагента и проверяет кратность. */
  private async priceItems(partnerId: string, items: OrderItemInput[]) {
    const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const priceTypeId =
      partner.priceTypeId ?? (await this.prisma.priceType.findFirst({ where: { isDefault: true } }))?.id;
    if (!priceTypeId) throw new BadRequestException('Не настроен тип цен — обратитесь к администратору');

    // одинаковые товары складываем в одну строку
    const merged = new Map<string, number>();
    for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...merged.keys()] } },
      include: { prices: { where: { priceTypeId } } },
    });
    const lines = [...merged].map(([productId, qty]) => {
      const p = products.find((x) => x.id === productId);
      if (!p || !p.visible) throw new BadRequestException('Товар больше недоступен — обновите корзину');
      const multiplicity = Number(p.multiplicity);
      if (!checkMultiplicity(qty, multiplicity)) {
        throw new BadRequestException(`«${p.name}»: количество должно быть кратно ${multiplicity} ${p.unit}`);
      }
      const price = p.prices[0]?.price;
      if (price == null) throw new BadRequestException(`«${p.name}»: нет цены — обратитесь к менеджеру`);
      return {
        productId,
        name: p.name,
        unit: p.unit,
        qty,
        price: Number(price),
        sum: round2(qty * Number(price)),
      };
    });
    const total = round2(lines.reduce((s, l) => s + l.sum, 0));
    return { lines, total };
  }

  async create(user: AuthUser, dto: CreateOrderDto) {
    if (!canOrder(user)) throw new ForbiddenException('Оформление заказов для вашей учётной записи не открыто');
    const partnerId = user.partnerId!;
    const settings = await this.settings.get();

    if (!isIsoDate(dto.deliveryDate)) throw new BadRequestException('Некорректная дата доставки');
    const dateError = checkDeliveryDate(dto.deliveryDate, settings.cutoffTime);
    if (dateError) throw new BadRequestException(dateError);

    const address = dto.addressId
      ? await this.prisma.address.findFirst({ where: { id: dto.addressId, partnerId } })
      : await this.prisma.address.findFirst({ where: { partnerId }, orderBy: { isDefault: 'desc' } });
    if (!address) throw new BadRequestException('Добавьте адрес доставки');

    const { lines, total } = await this.priceItems(partnerId, dto.items);
    const minSum = Number(settings.minOrderSum);
    if (total < minSum) {
      throw new BadRequestException(`Минимальная сумма заказа — ${minSum} сом, у вас ${total} сом`);
    }

    const order = await this.prisma.order.create({
      data: {
        partnerId,
        createdById: user.id,
        deliveryDate: toDbDate(dto.deliveryDate),
        deliveryAddress: address.address,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        deliveryEntrance: address.entrance,
        comment: dto.comment,
        total,
        items: { create: lines },
        history: { create: { to: 'NEW', userId: user.id } },
      },
      include: orderInclude,
    });
    // Одобрения нет: заказ сразу уходит в 1С и в цех, менеджер только следит
    await this.outbox.enqueueOrder(order.id, 'CUSTOMER_ORDER');
    await this.notifications.toRoles(['ADMIN', 'MANAGER', 'WORKSHOP'], {
      title: `Новый заказ №${order.number}`,
      body: `${order.partner.name} — ${total} сом на ${dto.deliveryDate}`,
      orderId: order.id,
    });
    return serializeOrder(order);
  }

  /** Заказы с учётом роли: партнёр — свои, цех и курьер — только «свои» статусы. */
  async list(user: AuthUser, f: OrderFilter) {
    const where: Prisma.OrderWhereInput = {
      status: Array.isArray(f.status) ? { in: f.status } : f.status,
      partnerId: f.partnerId,
      deliveryDate:
        f.dateFrom || f.dateTo
          ? {
              gte: f.dateFrom && isIsoDate(f.dateFrom) ? toDbDate(f.dateFrom) : undefined,
              lte: f.dateTo && isIsoDate(f.dateTo) ? toDbDate(f.dateTo) : undefined,
            }
          : undefined,
    };
    if (f.paid !== undefined) where.paidAt = f.paid ? { not: null } : null;
    if (f.search) {
      const n = Number(f.search);
      where.OR = [
        { partner: { name: { contains: f.search, mode: 'insensitive' } } },
        ...(Number.isInteger(n) ? [{ number: n }] : []),
      ];
    }
    const scoped = this.scope(user, where);
    const orders = await this.prisma.order.findMany({
      where: scoped,
      include: orderInclude,
      orderBy: [{ deliveryDate: 'desc' }, { number: 'desc' }],
      take: 300,
    });
    return orders.map(serializeOrder);
  }

  private scope(user: AuthUser, where: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
    switch (user.role) {
      case 'ADMIN':
      case 'MANAGER':
      case 'ACCOUNTANT':
        return where;
      case 'WORKSHOP':
        return { AND: [where, { status: { in: WORKSHOP_STATUSES } }] };
      case 'COURIER':
        return { AND: [where, { status: { in: COURIER_STATUSES } }] };
      default:
        if (!user.partnerId) return { id: '__none__' };
        return { AND: [where, { partnerId: user.partnerId }] };
    }
  }

  async get(user: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({
      where: this.scope(user, { id }),
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Заказ не найден');
    return { ...serializeOrder(order), actions: allowedTransitions(order.status, user.role) };
  }

  /** Менеджер правит состав заказа по согласованию с клиентом. */
  async updateItems(user: AuthUser, id: string, items: OrderItemInput[], comment?: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException('Состав можно менять только до начала производства');
    }
    const { lines, total } = await this.priceItems(order.partnerId, items);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.order.update({
        where: { id },
        data: {
          total,
          items: { create: lines },
          history: {
            create: {
              from: order.status,
              to: order.status,
              userId: user.id,
              comment: comment ?? 'Состав заказа изменён',
            },
          },
        },
        include: orderInclude,
      });
    });
    await this.audit.log(user.id, 'order.edit_items', 'Order', id, {
      before: order.items.map((i) => ({ productId: i.productId, qty: Number(i.qty) })),
      after: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    });
    await this.notifications.toPartner(order.partnerId, {
      title: `Заказ №${order.number} изменён`,
      body: `Менеджер скорректировал состав. Новая сумма: ${total} сом`,
      orderId: id,
    });
    return serializeOrder(updated);
  }

  async changeStatus(user: AuthUser, id: string, dto: StatusDto) {
    const order = await this.prisma.order.findFirst({ where: this.scope(user, { id }) });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!canTransition(order.status, dto.status, user.role)) {
      throw new ForbiddenException(
        `Нельзя перевести заказ из «${ORDER_STATUS_LABELS[order.status]}» в «${ORDER_STATUS_LABELS[dto.status]}»`,
      );
    }
    if ((dto.status === 'REJECTED' || (dto.status === 'CANCELLED' && isStaff(user))) && !dto.comment) {
      throw new BadRequestException('Укажите причину');
    }
    return this.transition(order.id, dto.status, user, dto);
  }

  /** Бухгалтер отмечает оплату. Статус заказа не меняется: цех готовит независимо от оплаты. */
  async markPaid(user: AuthUser, id: string, paymentMethod?: string, comment?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (order.status === 'REJECTED' || order.status === 'CANCELLED') {
      throw new BadRequestException('Заказ отменён — оплату отметить нельзя');
    }
    if (order.paidAt) throw new BadRequestException('Оплата уже отмечена');
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paidAt: new Date(),
        paidById: user.id,
        paymentMethod: paymentMethod || 'manual',
        history: {
          create: { from: order.status, to: order.status, userId: user.id, comment: comment || 'Оплата получена' },
        },
      },
      include: orderInclude,
    });
    await this.audit.log(user.id, 'order.paid', 'Order', id, { paymentMethod: paymentMethod ?? null });
    await this.notifications.toPartner(order.partnerId, {
      title: `Заказ №${order.number}`,
      body: 'Оплата получена. Спасибо!',
      orderId: id,
    });
    return serializeOrder(updated);
  }

  /**
   * Применяет смену статуса со всеми последствиями: история, поля оплаты/доставки,
   * очередь в 1С, уведомления. Используется и сводной накладной.
   */
  async transition(
    orderId: string,
    to: OrderStatus,
    user: AuthUser,
    extra: { comment?: string; productionSheetId?: string; receivedBy?: string } = {},
  ) {
    const now = new Date();
    const before = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const data: Prisma.OrderUpdateInput = {
      status: to,
      history: { create: { from: before.status, to, userId: user.id, comment: extra.comment } },
    };
    if (to === 'REJECTED' || to === 'CANCELLED') data.rejectReason = extra.comment;
    if (to === 'IN_PRODUCTION' && extra.productionSheetId) {
      data.productionSheet = { connect: { id: extra.productionSheetId } };
    }
    if (to === 'SHIPPED') {
      data.shippedAt = now;
      if (user.role === 'COURIER') data.courier = { connect: { id: user.id } };
    }
    if (to === 'DELIVERED') {
      data.deliveredAt = now;
      if (extra.receivedBy) data.receivedBy = extra.receivedBy;
    }

    const order = await this.prisma.order.update({ where: { id: orderId }, data, include: orderInclude });
    await this.audit.log(user.id, `order.${to.toLowerCase()}`, 'Order', orderId, {
      from: before.status,
      comment: extra.comment ?? null,
    });

    if (to === 'SHIPPED') await this.outbox.enqueueOrder(orderId, 'SALE');

    await this.notifyStatus(order.partnerId, order.number, order.id, to, extra.comment);
    if (to === 'READY') {
      await this.notifications.toRoles(['COURIER'], {
        title: `Заказ №${order.number} готов`,
        body: `${order.partner.name}: ${order.deliveryAddress}`,
        orderId,
      });
    }
    return serializeOrder(order);
  }

  private notifyStatus(
    partnerId: string,
    number: number,
    orderId: string,
    to: OrderStatus,
    comment?: string,
  ) {
    const texts: Partial<Record<OrderStatus, string>> = {
      IN_PRODUCTION: 'Мы уже готовим ваш заказ',
      READY: 'Заказ готов к отгрузке',
      SHIPPED: 'Курьер уже в пути — следите на карте',
      DELIVERED: 'Заказ доставлен. Приятного аппетита!',
      REJECTED: `Заказ отклонён${comment ? `: ${comment}` : ''}`,
      CANCELLED: `Заказ отменён${comment ? `: ${comment}` : ''}`,
    };
    const body = texts[to];
    if (!body) return;
    return this.notifications.toPartner(partnerId, { title: `Заказ №${number}`, body, orderId });
  }
}
