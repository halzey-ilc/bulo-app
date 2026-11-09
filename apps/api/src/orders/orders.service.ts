import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderChannel, OrderStatus, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { ORDER_STATUS_LABELS } from '@bulo/shared';
import { AuditService } from '../common/audit.service';
import { AuthUser, canOrder, isStaff } from '../common/auth-user';
import { isIsoDate, localNow, toDbDate } from '../common/dates';
import { buildPaymentQr } from '../common/elqr';
import { NotificationsService } from '../common/notifications.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { StockService } from '../common/stock.service';
import { OutboxService } from '../onec/outbox.service';
import { buyerName, ConfirmDto, CreateOrderDto, OrderItemInput, orderInclude, serializeOrder, StatusDto } from './order-dto';
import {
  allowedTransitions,
  AWAITING_PRODUCTION,
  canConfirm,
  canTransition,
  checkDeliveryDate,
  checkMultiplicity,
  EDITABLE_STATUSES,
  paymentAllowed,
  PaymentMethod,
  round2,
} from './order-rules';
import { checkPickup, localToDate } from './pickup';
import { applyCoffeePromo, loyaltyCard } from './promo';

export interface OrderFilter {
  status?: OrderStatus | OrderStatus[];
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** true — только оплаченные, false — только неоплаченные */
  paid?: boolean;
  channel?: OrderChannel;
  branchId?: string;
  /** Ждут подтверждения админа/менеджера */
  awaiting?: boolean;
}

/** Статусы, в которых курьер видит заказ. */
const COURIER_STATUSES: OrderStatus[] = ['READY', 'SHIPPED', 'DELIVERED'];
/** Статусы, в которых цех видит заказ: подтверждённое и ещё не отгруженное. */
const WORKSHOP_STATUSES: OrderStatus[] = [...AWAITING_PRODUCTION, 'IN_PRODUCTION', 'READY'];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  QR: 'QR-код',
  BANK: 'Расчётный счёт',
  CASH: 'Наличные',
};

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Orders');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // каждые 10 минут снимаем неоплаченные брони, которые так и не забрали
    this.timer = setInterval(() => void this.expireReservations().catch((e) => this.logger.warn(e.message)), 10 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Считает позиции по типу цен, проверяет кратность и остатки, отмечает кофе по акции. */
  private async priceItems(priceTypeId: string, items: OrderItemInput[], warehouseId: string | null) {
    const merged = new Map<string, number>();
    for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...merged.keys()] } },
      include: { prices: { where: { priceTypeId } }, category: true },
    });
    const stock = await this.stock.available([...merged.keys()], warehouseId);
    const lines = [...merged].map(([productId, qty]) => {
      const p = products.find((x) => x.id === productId);
      if (!p || !p.visible) throw new BadRequestException('Товар больше недоступен — обновите корзину');
      const multiplicity = Number(p.multiplicity);
      if (!checkMultiplicity(qty, multiplicity)) {
        throw new BadRequestException(`«${p.name}»: количество должно быть кратно ${multiplicity} ${p.unit}`);
      }
      const price = p.prices[0]?.price;
      if (price == null) throw new BadRequestException(`«${p.name}» сейчас нет в продаже`);
      const left = stock.get(productId);
      if (left !== undefined && qty > left) {
        throw new BadRequestException(left > 0 ? `«${p.name}»: осталось только ${left} ${p.unit}` : `«${p.name}» закончился`);
      }
      return {
        productId,
        name: p.name,
        unit: p.unit,
        qty,
        price: Number(price),
        sum: round2(qty * Number(price)),
        promo: p.category.promoCoffee,
        freeQty: 0,
      };
    });
    const total = round2(lines.reduce((s, l) => s + l.sum, 0));
    return { lines, total };
  }

  private async defaultPriceTypeId(partnerPriceTypeId: string | null) {
    const id =
      partnerPriceTypeId ?? (await this.prisma.priceType.findFirst({ where: { isDefault: true } }))?.id;
    if (!id) throw new BadRequestException('Не настроен тип цен — обратитесь к администратору');
    return id;
  }

  /** Сколько кофе гость уже купил (для карты «7-й бесплатно»). */
  async coffeeCount(userId: string) {
    const r = await this.prisma.orderItem.aggregate({
      _sum: { qty: true },
      where: { promo: true, order: { createdById: userId, channel: 'CAFE', status: { notIn: ['REJECTED', 'CANCELLED'] } } },
    });
    return Math.floor(Number(r._sum.qty ?? 0));
  }

  async loyalty(user: AuthUser) {
    const s = await this.settings.get();
    const total = await this.coffeeCount(user.id);
    return { enabled: s.promoEnabled, ...loyaltyCard(total, s.promoEvery) };
  }

  async create(user: AuthUser, dto: CreateOrderDto) {
    if (!canOrder(user)) throw new ForbiddenException('Оформление заказов для вашей учётной записи не открыто');
    // гость кофейни: без партнёра, бронь в филиале
    if (!user.partnerId) return this.createReservation(user, dto);

    const partnerId = user.partnerId;
    const settings = await this.settings.get();
    if (!dto.deliveryDate || !isIsoDate(dto.deliveryDate)) throw new BadRequestException('Некорректная дата доставки');
    const dateError = checkDeliveryDate(dto.deliveryDate, settings.cutoffTime);
    if (dateError) throw new BadRequestException(dateError);
    const method = dto.paymentMethod ?? 'BANK';
    if (!paymentAllowed(method, 'PARTNER')) throw new BadRequestException('Выберите способ оплаты');

    const address = dto.addressId
      ? await this.prisma.address.findFirst({ where: { id: dto.addressId, partnerId } })
      : await this.prisma.address.findFirst({ where: { partnerId }, orderBy: { isDefault: 'desc' } });
    if (!address) throw new BadRequestException('Добавьте адрес доставки');

    const priceTypeId = await this.defaultPriceTypeId(user.partner?.priceTypeId ?? null);
    const { lines, total } = await this.priceItems(priceTypeId, dto.items, null);
    const minSum = Number(settings.minOrderSum);
    if (total < minSum) {
      throw new BadRequestException(`Минимальная сумма заказа — ${minSum} сом, у вас ${total} сом`);
    }

    const order = await this.prisma.order.create({
      data: {
        channel: 'PARTNER',
        partnerId,
        createdById: user.id,
        deliveryDate: toDbDate(dto.deliveryDate),
        deliveryAddress: address.address,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        deliveryEntrance: address.entrance,
        comment: dto.comment,
        paymentMethod: method,
        total,
        items: { create: lines },
        history: { create: { to: 'NEW', userId: user.id, comment: `Оплата: ${PAYMENT_LABELS[method]}` } },
      },
      include: orderInclude,
    });
    // В цех и в 1С заказ уйдёт после подтверждения оплаты админом или менеджером
    await this.notifications.toRoles(['ADMIN', 'MANAGER', 'ACCOUNTANT'], {
      title: `Заказ №${order.number} ждёт оплаты`,
      body: `${order.partner!.name} — ${total} сом на ${dto.deliveryDate}, ${PAYMENT_LABELS[method].toLowerCase()}`,
      orderId: order.id,
    });
    return serializeOrder(order);
  }

  /** Бронь гостя кофейни: самовывоз сегодня или завтра, акция на кофе. */
  private async createReservation(user: AuthUser, dto: CreateOrderDto) {
    const branch = dto.branchId
      ? await this.prisma.branch.findFirst({ where: { id: dto.branchId, active: true } })
      : await this.prisma.branch.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    if (!branch) throw new BadRequestException('Выберите филиал');
    const pickupAt = new Date(dto.pickupAt ?? '');
    const pickupError = checkPickup(pickupAt, branch.opensAt, branch.closesAt);
    if (pickupError) throw new BadRequestException(pickupError);
    const method = dto.paymentMethod ?? 'CASH';
    if (!paymentAllowed(method, 'CAFE')) throw new BadRequestException('В кофейне можно оплатить по QR или наличными');

    const settings = await this.settings.get();
    const { lines, total: gross } = await this.priceItems(branch.priceTypeId, dto.items, branch.oneCWarehouseId);

    let discount = 0;
    let freeCoffees = 0;
    if (settings.promoEnabled) {
      const promo = applyCoffeePromo(lines, await this.coffeeCount(user.id), settings.promoEvery);
      discount = promo.discount;
      freeCoffees = promo.freeCount;
      for (const l of lines) l.freeQty = promo.free.get(l.productId) ?? 0;
    }
    const total = round2(gross - discount);
    const day = localNow(pickupAt).date;

    const order = await this.prisma.order.create({
      data: {
        channel: 'CAFE',
        branchId: branch.id,
        createdById: user.id,
        pickupAt,
        deliveryDate: toDbDate(day),
        deliveryAddress: `Самовывоз: ${branch.name}${branch.address ? `, ${branch.address}` : ''}`,
        deliveryLat: branch.lat,
        deliveryLng: branch.lng,
        comment: dto.comment,
        paymentMethod: method,
        total,
        discount,
        freeCoffees,
        items: { create: lines },
        history: {
          create: {
            to: 'NEW',
            userId: user.id,
            comment: `Бронь на ${localNow(pickupAt).time}, оплата: ${PAYMENT_LABELS[method]}${freeCoffees ? `, кофе в подарок: ${freeCoffees}` : ''}`,
          },
        },
      },
      include: orderInclude,
    });
    if (user.branchId !== branch.id) {
      await this.prisma.user.update({ where: { id: user.id }, data: { branchId: branch.id } });
    }
    await this.notifications.toRoles(['ADMIN', 'MANAGER', 'CASHIER'], {
      title: `Бронь №${order.number} — ${branch.name}`,
      body: `${user.name} заберёт в ${localNow(pickupAt).time}: ${total} сом, ${PAYMENT_LABELS[method].toLowerCase()}`,
      orderId: order.id,
    });
    return serializeOrder(order);
  }

  /** Заказы с учётом роли: партнёр — свои, цех и курьер — только «свои» статусы. */
  async list(user: AuthUser, f: OrderFilter) {
    const where: Prisma.OrderWhereInput = {
      status: Array.isArray(f.status) ? { in: f.status } : f.status,
      partnerId: f.partnerId,
      channel: f.channel,
      branchId: f.branchId,
      deliveryDate:
        f.dateFrom || f.dateTo
          ? {
              gte: f.dateFrom && isIsoDate(f.dateFrom) ? toDbDate(f.dateFrom) : undefined,
              lte: f.dateTo && isIsoDate(f.dateTo) ? toDbDate(f.dateTo) : undefined,
            }
          : undefined,
    };
    if (f.paid !== undefined) where.paidAt = f.paid ? { not: null } : null;
    if (f.awaiting) {
      where.status = 'NEW';
      where.confirmedAt = null;
    }
    if (f.search) {
      const n = Number(f.search);
      where.OR = [
        { partner: { name: { contains: f.search, mode: 'insensitive' } } },
        { createdBy: { name: { contains: f.search, mode: 'insensitive' } } },
        { createdBy: { phone: { contains: f.search } } },
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
      case 'CASHIER':
        return { AND: [where, { channel: 'CAFE' }] };
      case 'WORKSHOP':
        return { AND: [where, { channel: 'PARTNER', status: { in: WORKSHOP_STATUSES } }] };
      case 'COURIER':
        return { AND: [where, { channel: 'PARTNER', status: { in: COURIER_STATUSES } }] };
      default:
        if (user.partnerId) return { AND: [where, { partnerId: user.partnerId }] };
        return { AND: [where, { createdById: user.id }] };
    }
  }

  async get(user: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({
      where: this.scope(user, { id }),
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Заказ не найден');
    return {
      ...serializeOrder(order),
      actions: allowedTransitions(order.status, user.role, order.channel),
      canConfirm: order.status === 'NEW' && !order.confirmedAt && canConfirm(user.role, order.channel),
      canMarkPaid:
        !order.paidAt &&
        !['REJECTED', 'CANCELLED', 'NEW'].includes(order.status) &&
        canConfirm(user.role, order.channel),
    };
  }

  /** Как оплатить: QR с суммой, реквизиты счёта. Видит покупатель и сотрудники. */
  async payment(user: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({ where: this.scope(user, { id }) });
    if (!order) throw new NotFoundException('Заказ не найден');
    const s = await this.settings.get();
    const amount = Number(order.total);
    let qr: string | null = null;
    let qrImage: string | null = null;
    if (s.qrPayload) {
      try {
        qr = buildPaymentQr(s.qrPayload, amount, s.qrWithAmount);
        qrImage = await QRCode.toDataURL(qr, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } });
      } catch (e) {
        this.logger.warn(`QR не собран: ${(e as Error).message}`);
      }
    }
    return {
      orderId: order.id,
      number: order.number,
      amount,
      method: order.paymentMethod,
      paidAt: order.paidAt,
      claimedAt: order.paymentClaimedAt,
      receiptUrl: order.receiptUrl,
      qr: qr ? { value: qr, image: qrImage, withAmount: s.qrWithAmount, recipient: s.companyName } : null,
      bank:
        s.bankAccount || s.bankName
          ? {
              name: s.bankName,
              recipient: s.bankRecipient ?? s.companyName,
              account: s.bankAccount,
              bik: s.bankBik,
              inn: s.bankInn,
              purpose: `Оплата заказа №${order.number}`,
            }
          : null,
    };
  }

  /** Покупатель сообщает, что оплатил по QR или переводом (можно с фото чека). */
  async claimPaid(user: AuthUser, id: string, receiptUrl?: string) {
    const order = await this.prisma.order.findFirst({ where: this.scope(user, { id }), include: { partner: true, createdBy: true } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (order.paidAt) throw new BadRequestException('Оплата уже подтверждена');
    if (order.status === 'REJECTED' || order.status === 'CANCELLED') throw new BadRequestException('Заказ отменён');
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paymentClaimedAt: new Date(),
        receiptUrl: receiptUrl ?? order.receiptUrl,
        history: {
          create: {
            from: order.status,
            to: order.status,
            userId: user.id,
            comment: receiptUrl ? 'Покупатель оплатил и приложил чек' : 'Покупатель сообщил об оплате',
          },
        },
      },
      include: orderInclude,
    });
    await this.notifications.toRoles(order.channel === 'CAFE' ? ['ADMIN', 'MANAGER', 'CASHIER'] : ['ADMIN', 'MANAGER', 'ACCOUNTANT'], {
      title: `Оплата по №${order.number} — проверьте`,
      body: `${buyerName(order)} оплатил ${Number(order.total)} сом${receiptUrl ? ', чек приложен' : ''}. Подтвердите заказ`,
      orderId: id,
    });
    return serializeOrder(updated);
  }

  /**
   * Админ/менеджер подтверждает заказ после оплаты (или принимает заказ «за наличные»).
   * После подтверждения: партнёрский заказ видит цех, товар списывается в 1С.
   */
  async confirm(user: AuthUser, id: string, dto: ConfirmDto = {}) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!canConfirm(user.role, order.channel)) throw new ForbiddenException('Подтверждать заказы может админ или менеджер');
    if (order.status !== 'NEW' || order.confirmedAt) throw new BadRequestException('Заказ уже подтверждён или закрыт');

    const method = (dto.paymentMethod ?? order.paymentMethod ?? 'CASH') as PaymentMethod;
    if (!paymentAllowed(method, order.channel)) throw new BadRequestException('Этот способ оплаты здесь не принимается');
    // QR и перевод подтверждаем, когда деньги пришли; наличные — когда отдадут при выдаче/доставке
    const paidNow = method !== 'CASH' || dto.paid === true;
    const now = new Date();
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'PAID',
        confirmedAt: now,
        confirmedById: user.id,
        paymentMethod: method,
        ...(paidNow ? { paidAt: now, paidById: user.id } : {}),
        history: {
          create: {
            from: 'NEW',
            to: 'PAID',
            userId: user.id,
            comment:
              dto.comment ??
              (paidNow ? `Оплата получена: ${PAYMENT_LABELS[method]}` : 'Подтверждён, оплата наличными при получении'),
          },
        },
      },
      include: orderInclude,
    });
    await this.audit.log(user.id, 'order.confirm', 'Order', id, { paymentMethod: method, paid: paidNow });
    // списание в 1С
    await this.outbox.enqueueOrder(id, 'CUSTOMER_ORDER');

    if (order.channel === 'PARTNER') {
      await this.notifications.toUsers([order.createdById], {
        title: `Заказ №${order.number} подтверждён`,
        body: paidNow ? 'Оплата получена — заказ передан в цех' : 'Заказ передан в цех, оплата наличными при доставке',
        orderId: id,
      });
      await this.notifications.toRoles(['WORKSHOP'], {
        title: `Новый заказ №${order.number} в цех`,
        body: `${updated.partner?.name ?? ''} — на ${updated.deliveryDate.toISOString().slice(0, 10)}`,
        orderId: id,
      });
    } else {
      const at = order.pickupAt ? localNow(order.pickupAt).time : '';
      await this.notifications.toUsers([order.createdById], {
        title: `Бронь №${order.number} подтверждена`,
        body: `Ждём вас${at ? ` в ${at}` : ''} — ${updated.branch?.name ?? 'в кофейне'}`,
        orderId: id,
      });
    }
    return serializeOrder(updated);
  }

  /** Менеджер правит состав заказа по согласованию с клиентом. */
  async updateItems(user: AuthUser, id: string, items: OrderItemInput[], comment?: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, partner: true, branch: true } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException('Состав можно менять только до начала производства');
    }
    if (order.confirmedAt) throw new BadRequestException('Заказ уже подтверждён и передан в 1С — состав менять нельзя');
    const priceTypeId =
      order.channel === 'CAFE' && order.branch
        ? order.branch.priceTypeId
        : await this.defaultPriceTypeId(order.partner?.priceTypeId ?? null);
    const { lines, total } = await this.priceItems(priceTypeId, items, null);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.order.update({
        where: { id },
        data: {
          total,
          discount: 0,
          freeCoffees: 0,
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
    await this.notifications.toUsers([order.createdById], {
      title: `Заказ №${order.number} изменён`,
      body: `Менеджер скорректировал состав. Новая сумма: ${total} сом`,
      orderId: id,
    });
    return serializeOrder(updated);
  }

  async changeStatus(user: AuthUser, id: string, dto: StatusDto) {
    const order = await this.prisma.order.findFirst({ where: this.scope(user, { id }) });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!canTransition(order.status, dto.status, user.role, order.channel)) {
      throw new ForbiddenException(
        `Нельзя перевести заказ из «${ORDER_STATUS_LABELS[order.status]}» в «${ORDER_STATUS_LABELS[dto.status]}»`,
      );
    }
    if ((dto.status === 'REJECTED' || (dto.status === 'CANCELLED' && isStaff(user))) && !dto.comment) {
      throw new BadRequestException('Укажите причину');
    }
    return this.transition(order.id, dto.status, user, dto);
  }

  /** Отметить, что деньги получены (наличные при доставке/выдаче или запоздалый перевод). */
  async markPaid(user: AuthUser, id: string, paymentMethod?: string, comment?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (order.status === 'REJECTED' || order.status === 'CANCELLED') {
      throw new BadRequestException('Заказ отменён — оплату отметить нельзя');
    }
    if (order.paidAt) throw new BadRequestException('Оплата уже отмечена');
    const method = paymentMethod && paymentAllowed(paymentMethod, order.channel) ? paymentMethod : undefined;
    // неподтверждённый заказ — подтверждаем вместе с оплатой
    if (order.status === 'NEW' && !order.confirmedAt) {
      return this.confirm(user, id, { paymentMethod: method as PaymentMethod | undefined, paid: true, comment });
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paidAt: new Date(),
        paidById: user.id,
        paymentMethod: method ?? order.paymentMethod ?? 'CASH',
        history: {
          create: { from: order.status, to: order.status, userId: user.id, comment: comment || 'Оплата получена' },
        },
      },
      include: orderInclude,
    });
    await this.audit.log(user.id, 'order.paid', 'Order', id, { paymentMethod: method ?? null });
    await this.notifications.toUsers([order.createdById], {
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
    /** null — действие системы (например, автоотмена брони) */
    user: AuthUser | null,
    extra: { comment?: string; productionSheetId?: string; receivedBy?: string; cashReceived?: boolean } = {},
  ) {
    const now = new Date();
    const uid = user?.id ?? null;
    const before = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const data: Prisma.OrderUpdateInput = {
      status: to,
      history: { create: { from: before.status, to, userId: uid, comment: extra.comment } },
    };
    if (to === 'REJECTED' || to === 'CANCELLED') data.rejectReason = extra.comment;
    if (to === 'IN_PRODUCTION' && extra.productionSheetId) {
      data.productionSheet = { connect: { id: extra.productionSheetId } };
    }
    if (to === 'SHIPPED') {
      data.shippedAt = now;
      if (user?.role === 'COURIER') data.courier = { connect: { id: user.id } };
    }
    if (to === 'DELIVERED') {
      data.deliveredAt = now;
      if (extra.receivedBy) data.receivedBy = extra.receivedBy;
      // наличные: при выдаче гостю или доставке партнёру деньги получены
      if (!before.paidAt && before.paymentMethod === 'CASH' && (before.channel === 'CAFE' || extra.cashReceived)) {
        data.paidAt = now;
        data.paidById = uid;
      }
    }

    const order = await this.prisma.order.update({ where: { id: orderId }, data, include: orderInclude });
    await this.audit.log(uid, `order.${to.toLowerCase()}`, 'Order', orderId, {
      from: before.status,
      comment: extra.comment ?? null,
    });

    if (to === 'SHIPPED' || (to === 'DELIVERED' && order.channel === 'CAFE')) await this.outbox.enqueueOrder(orderId, 'SALE');
    // подтверждённый заказ уже списан в 1С — отменяем списание
    if ((to === 'CANCELLED' || to === 'REJECTED') && before.confirmedAt) await this.outbox.enqueueOrder(orderId, 'CANCEL');

    await this.notifyStatus(order, to, extra.comment);
    if (to === 'READY' && order.channel === 'PARTNER') {
      await this.notifications.toRoles(['COURIER'], {
        title: `Заказ №${order.number} готов`,
        body: `${buyerName(order)}: ${order.deliveryAddress}`,
        orderId,
      });
    }
    return serializeOrder(order);
  }

  private notifyStatus(order: { id: string; number: number; channel: OrderChannel; createdById: string; branch: { name: string } | null }, to: OrderStatus, comment?: string) {
    const cafe = order.channel === 'CAFE';
    const texts: Partial<Record<OrderStatus, string>> = {
      IN_PRODUCTION: 'Мы уже готовим ваш заказ',
      READY: cafe ? `Готово! Можно забирать${order.branch ? ` — ${order.branch.name}` : ''}` : 'Заказ готов к отгрузке',
      SHIPPED: 'Курьер уже в пути — следите на карте',
      DELIVERED: cafe ? 'Приятного аппетита! Будем рады видеть снова' : 'Заказ доставлен. Приятного аппетита!',
      REJECTED: `Заказ отклонён${comment ? `: ${comment}` : ''}`,
      CANCELLED: `Заказ отменён${comment ? `: ${comment}` : ''}`,
    };
    const body = texts[to];
    if (!body) return;
    return this.notifications.toUsers([order.createdById], {
      title: `${cafe ? 'Бронь' : 'Заказ'} №${order.number}`,
      body,
      orderId: order.id,
    });
  }

  /** Неоплаченные брони, которые не забрали до закрытия филиала, снимаем. Оплаченные оставляем — разберётся менеджер. */
  async expireReservations(now = new Date()) {
    const today = localNow(now);
    const stale = await this.prisma.order.findMany({
      where: {
        channel: 'CAFE',
        status: { in: ['NEW', 'PAID', 'READY'] },
        paidAt: null,
        deliveryDate: { lte: toDbDate(today.date) },
      },
      include: { branch: true },
    });
    let n = 0;
    for (const o of stale) {
      const day = o.deliveryDate.toISOString().slice(0, 10);
      const closes = localToDate(day, o.branch?.closesAt ?? '22:00');
      // через час после закрытия
      if (now.getTime() < closes.getTime() + 60 * 60_000) continue;
      // отменяет система, а не конкретный сотрудник
      await this.transition(o.id, 'CANCELLED', null, { comment: 'Бронь не забрали — снята автоматически после закрытия' });
      n++;
    }
    if (n) this.logger.log(`Снято броней, которые не забрали: ${n}`);
    return n;
  }
}
