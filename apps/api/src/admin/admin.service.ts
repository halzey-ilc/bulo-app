import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerStatus, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../auth/phone';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { fromDbDate, localNow, toDbDate } from '../common/dates';
import { NotificationsService } from '../common/notifications.service';
import { PrismaService } from '../common/prisma.service';
import type { CreatePartnerDto, CreateUserDto, PartnerDto, UpdateUserDto } from './admin.dto';

const userSelect = {
  id: true,
  phone: true,
  login: true,
  name: true,
  email: true,
  role: true,
  status: true,
  accessExpiresAt: true,
  canOrder: true,
  partnerId: true,
  partner: { select: { id: true, name: true, status: true } },
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private phone(raw?: string | null) {
    if (!raw) return null;
    const p = normalizePhone(raw);
    if (!p) throw new BadRequestException('Некорректный номер телефона');
    return p;
  }

  // ---------- Партнёры ----------

  partners(status?: PartnerStatus, search?: string) {
    return this.prisma.partner.findMany({
      where: {
        status,
        OR: search
          ? [
              { name: { contains: search, mode: 'insensitive' } },
              { inn: { contains: search } },
              { phone: { contains: search } },
            ]
          : undefined,
      },
      include: {
        priceType: true,
        addresses: true,
        _count: { select: { orders: true, users: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async partner(id: string) {
    const p = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        priceType: true,
        addresses: true,
        users: { select: userSelect },
        orders: { orderBy: { number: 'desc' }, take: 20 },
      },
    });
    if (!p) throw new NotFoundException('Партнёр не найден');
    const counterparty = p.oneCId
      ? await this.prisma.oneCCounterparty.findUnique({ where: { oneCId: p.oneCId } })
      : null;
    return {
      ...p,
      counterparty,
      orders: p.orders.map((o) => ({ ...o, deliveryDate: fromDbDate(o.deliveryDate), total: Number(o.total) })),
    };
  }

  async createPartner(user: AuthUser, dto: CreatePartnerDto) {
    const phone = this.phone(dto.phone)!;
    if (dto.createUser && (await this.prisma.user.findUnique({ where: { phone } }))) {
      throw new ConflictException('Пользователь с этим телефоном уже есть');
    }
    const partner = await this.prisma.partner.create({
      data: {
        name: dto.name,
        inn: dto.inn,
        contactName: dto.contactName,
        phone,
        email: dto.email,
        priceTypeId: dto.priceTypeId,
        oneCId: dto.oneCId,
        status: 'APPROVED',
        approvedAt: new Date(),
        addresses: dto.address ? { create: { address: dto.address, isDefault: true } } : undefined,
        users: dto.createUser ? { create: { phone, name: dto.contactName, role: 'PARTNER' } } : undefined,
      },
    });
    await this.audit.log(user.id, 'partner.create', 'Partner', partner.id);
    return partner;
  }

  async updatePartner(user: AuthUser, id: string, dto: PartnerDto) {
    const { priceTypeId, oneCId, phone, ...rest } = dto;
    const data: Prisma.PartnerUncheckedUpdateInput = { ...rest };
    if (phone) data.phone = this.phone(phone)!;
    if (priceTypeId !== undefined) data.priceTypeId = priceTypeId || null;
    if (oneCId !== undefined) data.oneCId = oneCId || null;
    const p = await this.prisma.partner.update({ where: { id }, data });
    await this.audit.log(user.id, 'partner.update', 'Partner', id, dto as object);
    return p;
  }

  async approvePartner(user: AuthUser, id: string, priceTypeId?: string, oneCId?: string) {
    const p = await this.prisma.partner.update({
      where: { id },
      data: {
        status: 'APPROVED',
        rejectReason: null,
        approvedAt: new Date(),
        priceTypeId: priceTypeId || undefined,
        oneCId: oneCId || undefined,
      },
    });
    await this.audit.log(user.id, 'partner.approve', 'Partner', id, { priceTypeId, oneCId });
    await this.notifications.toPartner(id, {
      title: 'Добро пожаловать в BULO!',
      body: 'Ваша заявка одобрена — цены и заказы уже доступны',
    });
    return p;
  }

  async setPartnerStatus(user: AuthUser, id: string, status: 'REJECTED' | 'BLOCKED' | 'APPROVED', reason?: string) {
    const p = await this.prisma.partner.update({
      where: { id },
      data: { status, rejectReason: reason ?? null },
    });
    if (status === 'BLOCKED') {
      // выкидываем всех пользователей контрагента из приложения
      await this.prisma.user.updateMany({ where: { partnerId: id }, data: { tokenVersion: { increment: 1 } } });
    }
    await this.audit.log(user.id, `partner.${status.toLowerCase()}`, 'Partner', id, { reason: reason ?? null });
    if (status === 'REJECTED') {
      await this.notifications.toPartner(id, { title: 'Заявка отклонена', body: reason ?? '' });
    }
    return p;
  }

  // ---------- Пользователи и роли ----------

  users(role?: Role, search?: string) {
    return this.prisma.user.findMany({
      where: {
        role,
        OR: search
          ? [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { login: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      select: userSelect,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async createUser(admin: AuthUser, dto: CreateUserDto) {
    const phone = this.phone(dto.phone);
    const login = dto.login?.trim().toLowerCase() || null;
    if (!phone && !login) throw new BadRequestException('Укажите телефон или логин');
    if (phone && (await this.prisma.user.findUnique({ where: { phone } }))) {
      throw new ConflictException('Пользователь с этим телефоном уже есть');
    }
    if (login && (await this.prisma.user.findUnique({ where: { login } }))) {
      throw new ConflictException('Логин занят');
    }
    if ((dto.role === 'PARTNER' || (dto.role === 'GUEST' && dto.canOrder)) && !dto.partnerId) {
      throw new BadRequestException('Для партнёра и гостя с заказами выберите контрагента');
    }
    // Клиенту (розничному покупателю) заводим личного контрагента, если админ не выбрал существующего
    let partnerId = dto.partnerId;
    if (dto.role === 'CLIENT' && !partnerId) {
      const retail = await this.prisma.priceType.findFirst({
        where: { name: { equals: 'Розничная', mode: 'insensitive' } },
      });
      const personal = await this.prisma.partner.create({
        data: {
          name: dto.name,
          contactName: dto.name,
          phone: phone ?? '',
          email: dto.email,
          status: 'APPROVED',
          approvedAt: new Date(),
          priceTypeId: retail?.id,
          note: 'Личный кабинет клиента',
        },
      });
      partnerId = personal.id;
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        role: dto.role,
        phone,
        login,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : null,
        email: dto.email,
        accessExpiresAt: dto.accessExpiresAt ? new Date(dto.accessExpiresAt) : null,
        canOrder: dto.canOrder ?? false,
        partnerId,
      },
      select: userSelect,
    });
    await this.audit.log(admin.id, 'user.create', 'User', user.id, { role: dto.role });
    return user;
  }

  async updateUser(admin: AuthUser, id: string, dto: UpdateUserDto) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Пользователь не найден');
    if (id === admin.id && (dto.status === 'BLOCKED' || (dto.role && dto.role !== 'ADMIN'))) {
      throw new BadRequestException('Нельзя заблокировать себя или снять с себя роль администратора');
    }
    const data: Prisma.UserUncheckedUpdateInput = {
      name: dto.name,
      role: dto.role,
      email: dto.email,
      status: dto.status,
      canOrder: dto.canOrder,
    };
    if (dto.phone !== undefined) data.phone = this.phone(dto.phone);
    if (dto.login !== undefined) data.login = dto.login ? dto.login.trim().toLowerCase() : null;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.accessExpiresAt !== undefined) {
      data.accessExpiresAt = dto.accessExpiresAt ? new Date(dto.accessExpiresAt) : null;
    }
    if (dto.partnerId !== undefined) data.partnerId = dto.partnerId;
    // смена роли, блокировка или пароля — старые сессии больше не действуют
    if ((dto.role && dto.role !== before.role) || dto.status === 'BLOCKED' || dto.password) {
      data.tokenVersion = { increment: 1 };
    }
    try {
      const user = await this.prisma.user.update({ where: { id }, data, select: userSelect });
      await this.audit.log(admin.id, 'user.update', 'User', id, { ...dto, password: dto.password ? '***' : undefined });
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Телефон или логин уже занят');
      }
      throw e;
    }
  }

  // ---------- Сводка и журнал ----------

  async dashboard() {
    const today = localNow().date;
    const [newOrders, awaitingPayment, paid, inProduction, ready, pendingPartners, todayOrders, onecErrors] =
      await Promise.all([
        this.prisma.order.count({ where: { status: 'NEW' } }),
        this.prisma.order.aggregate({ where: { status: 'APPROVED' }, _count: true, _sum: { total: true } }),
        this.prisma.order.count({ where: { status: 'PAID' } }),
        this.prisma.order.count({ where: { status: 'IN_PRODUCTION' } }),
        this.prisma.order.count({ where: { status: 'READY' } }),
        this.prisma.partner.count({ where: { status: 'PENDING' } }),
        this.prisma.order.aggregate({
          where: { deliveryDate: toDbDate(today), status: { notIn: ['REJECTED', 'CANCELLED'] } },
          _count: true,
          _sum: { total: true },
        }),
        this.prisma.oneCDocument.count({ where: { status: 'ERROR' } }),
      ]);
    return {
      today,
      newOrders,
      awaitingPayment: { count: awaitingPayment._count, total: Number(awaitingPayment._sum.total ?? 0) },
      paid,
      inProduction,
      ready,
      pendingPartners,
      todayDeliveries: { count: todayOrders._count, total: Number(todayOrders._sum.total ?? 0) },
      onecErrors,
    };
  }

  audit_(entity?: string, entityId?: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
