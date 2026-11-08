import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Order, OrderStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { AuthUser, isStaff } from '../common/auth-user';
import { NotificationsService } from '../common/notifications.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { ARRIVING_METERS, cumulativeEta, haversineKm, orderStops, Point, round } from './geo';
import { RoutingService } from './routing.service';

/** Позиция курьера старше этого считается неактуальной (курьер не на связи). */
const POSITION_FRESH_MS = 10 * 60_000;

export type DeliveryStage = 'preparing' | 'ready' | 'on_way' | 'arriving' | 'arrived' | 'delivered' | 'cancelled';

const point = (lat?: number | null, lng?: number | null): Point | null =>
  lat != null && lng != null ? { lat, lng } : null;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async bakery(): Promise<Point> {
    const s = await this.settings.get();
    return { lat: s.bakeryLat, lng: s.bakeryLng };
  }

  /** Последняя свежая позиция курьера или null. */
  async position(courierId: string) {
    const p = await this.prisma.courierPosition.findFirst({
      where: { userId: courierId },
      orderBy: { createdAt: 'desc' },
    });
    if (!p || Date.now() - p.createdAt.getTime() > POSITION_FRESH_MS) return null;
    return { lat: p.lat, lng: p.lng, heading: p.heading, speed: p.speed, accuracy: p.accuracy, at: p.createdAt };
  }

  async saveLocation(user: AuthUser, p: { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number }) {
    await this.prisma.courierPosition.create({ data: { userId: user.id, ...p } });
    if (!user.onShiftSince) {
      await this.prisma.user.update({ where: { id: user.id }, data: { onShiftSince: new Date() } });
    }
    // держим только последние сутки трека
    if (Math.random() < 0.02) {
      await this.prisma.courierPosition.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
    }
    // «Подъезжает»: один раз уведомляем получателя, когда курьер в 400 м от ближайшего адреса
    const active = await this.prisma.order.findMany({
      where: { courierId: user.id, status: 'SHIPPED', arrivedAt: null, deliveryLat: { not: null } },
    });
    for (const o of active) {
      const dist = haversineKm(p, { lat: o.deliveryLat!, lng: o.deliveryLng! }) * 1000;
      if (dist < ARRIVING_METERS) {
        const key = `arriving:${o.id}`;
        const already = await this.prisma.auditLog.findFirst({ where: { action: key } });
        if (!already) {
          await this.prisma.auditLog.create({ data: { userId: user.id, action: key, entity: 'Order', entityId: o.id } });
          await this.notifications.toPartner(o.partnerId, {
            title: `Заказ №${o.number}`,
            body: 'Курьер подъезжает — будет через пару минут',
            orderId: o.id,
          });
        }
      }
    }
    return { ok: true };
  }

  async setShift(user: AuthUser, on: boolean) {
    await this.prisma.user.update({ where: { id: user.id }, data: { onShiftSince: on ? new Date() : null } });
    return { onShift: on };
  }

  /**
   * Маршрут курьера на сегодня: заказы «к выдаче в пекарне» (READY) и «в пути» (SHIPPED у этого курьера),
   * порядок объезда, время прибытия по каждой точке и линия маршрута.
   */
  async courierRoute(user: AuthUser) {
    const bakery = await this.bakery();
    const position = await this.position(user.id);
    const [onWay, toPickup] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'SHIPPED', courierId: user.id },
        include: { partner: true, items: true },
      }),
      this.prisma.order.findMany({
        where: { status: 'READY', OR: [{ courierId: null }, { courierId: user.id }] },
        include: { partner: true, items: true },
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
      }),
    ]);

    const start = position ?? bakery;
    const located = onWay.filter((o) => o.deliveryLat != null);
    const ordered = orderStops(
      start,
      located.map((o) => ({ ...o, lat: o.deliveryLat!, lng: o.deliveryLng! })),
    );
    const route = await this.routing.route([start, ...ordered]);
    const eta = cumulativeEta(route.legMinutes);
    const now = Date.now();

    const stop = (o: (typeof onWay)[number], i: number | null) => ({
      orderId: o.id,
      number: o.number,
      status: o.status,
      partner: { name: o.partner.name, contactName: o.partner.contactName, phone: o.partner.phone },
      address: o.deliveryAddress,
      entrance: o.deliveryEntrance,
      comment: o.comment,
      point: point(o.deliveryLat, o.deliveryLng),
      itemsCount: o.items.length,
      unitsCount: o.items.reduce((s, it) => s + Number(it.qty), 0),
      total: Number(o.total),
      deliveryDate: o.deliveryDate.toISOString().slice(0, 10),
      arrivedAt: o.arrivedAt,
      distanceKm: i == null ? null : round(route.legKm.slice(0, i + 1).reduce((a, b) => a + b, 0)),
      etaMinutes: i == null ? null : Math.max(1, Math.round(eta[i])),
      etaAt: i == null ? null : new Date(now + eta[i] * 60_000),
    });

    return {
      bakery,
      position,
      onShift: !!user.onShiftSince,
      route: {
        geometry: route.geometry,
        byRoads: route.byRoads,
        maneuvers: route.maneuvers,
        totalKm: round(route.legKm.reduce((a, b) => a + b, 0)),
        totalMinutes: Math.round(eta.at(-1) ?? 0),
      },
      stops: [
        ...ordered.map((o, i) => stop(o, i)),
        // без координат — в конце списка, без ETA
        ...onWay.filter((o) => o.deliveryLat == null).map((o) => stop(o, null)),
      ],
      toPickup: toPickup.map((o) => stop(o, null)),
    };
  }

  private stage(o: Order, position: Point | null): DeliveryStage {
    const s: OrderStatus = o.status;
    if (s === 'DELIVERED') return 'delivered';
    if (s === 'REJECTED' || s === 'CANCELLED') return 'cancelled';
    if (s === 'READY') return 'ready';
    if (s !== 'SHIPPED') return 'preparing';
    if (o.arrivedAt) return 'arrived';
    const dest = point(o.deliveryLat, o.deliveryLng);
    if (position && dest && haversineKm(position, dest) * 1000 < ARRIVING_METERS) return 'arriving';
    return 'on_way';
  }

  /** Трекинг заказа для получателя и сотрудников: где курьер, сколько ехать, сколько заказов перед вами. */
  async tracking(user: AuthUser, orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { partner: true, courier: { select: { id: true, name: true, phone: true } } },
    });
    if (!o) throw new NotFoundException('Заказ не найден');
    const owner = !!user.partnerId && user.partnerId === o.partnerId;
    if (!owner && !isStaff(user)) throw new ForbiddenException('Нет доступа к заказу');
    if (user.role === 'COURIER' && o.courierId && o.courierId !== user.id) throw new ForbiddenException('Чужой заказ');

    const bakery = await this.bakery();
    const dest = point(o.deliveryLat, o.deliveryLng);
    const position = o.courierId && o.status === 'SHIPPED' ? await this.position(o.courierId) : null;
    const stage = this.stage(o, position);

    let etaMinutes: number | null = null;
    let distanceKm: number | null = null;
    let stopsBefore = 0;
    let geometry: [number, number][] = [];
    let byRoads = false;

    if (stage === 'on_way' || stage === 'arriving') {
      const start = position ?? bakery;
      if (dest) {
        // заказы курьера, которые он развезёт раньше этого
        const others = await this.prisma.order.findMany({
          where: { status: 'SHIPPED', courierId: o.courierId, arrivedAt: null, id: { not: o.id }, deliveryLat: { not: null } },
        });
        const all = orderStops(start, [
          ...others.map((x) => ({ id: x.id, lat: x.deliveryLat!, lng: x.deliveryLng! })),
          { id: o.id, lat: dest.lat, lng: dest.lng },
        ]);
        const idx = all.findIndex((x) => x.id === o.id);
        stopsBefore = idx;
        const route = await this.routing.route([start, ...all.slice(0, idx + 1)]);
        const eta = cumulativeEta(route.legMinutes);
        etaMinutes = Math.max(1, Math.round(eta[idx]));
        distanceKm = round(route.legKm.reduce((a, b) => a + b, 0));
        // путь курьера от текущей точки через предыдущие остановки до адреса получателя —
        // так метка курьера всегда лежит на линии
        geometry = route.geometry;
        byRoads = route.byRoads;
      }
    }

    return {
      orderId: o.id,
      number: o.number,
      status: o.status,
      stage,
      address: o.deliveryAddress,
      entrance: o.deliveryEntrance,
      destination: dest,
      bakery,
      courier: o.courier ? { name: o.courier.name, phone: o.courier.phone } : null,
      position,
      route: { geometry, byRoads },
      etaMinutes,
      etaAt: etaMinutes != null ? new Date(Date.now() + etaMinutes * 60_000) : null,
      distanceKm,
      stopsBefore,
      shippedAt: o.shippedAt,
      arrivedAt: o.arrivedAt,
      deliveredAt: o.deliveredAt,
      receivedBy: o.receivedBy,
    };
  }

  /** Курьер у двери: получатель получает уведомление. */
  async arrived(user: AuthUser, orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!o) throw new NotFoundException('Заказ не найден');
    if (o.status !== 'SHIPPED') throw new BadRequestException('Заказ ещё не в пути');
    if (user.role === 'COURIER' && o.courierId !== user.id) throw new ForbiddenException('Чужой заказ');
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { arrivedAt: new Date() } });
    await this.audit.log(user.id, 'order.arrived', 'Order', orderId);
    await this.notifications.toPartner(o.partnerId, {
      title: `Заказ №${o.number}`,
      body: 'Курьер на месте и скоро передаст заказ',
      orderId,
    });
    return { arrivedAt: updated.arrivedAt };
  }
}
