import { Injectable, Logger } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { sendFcm } from './fcm';
import { PrismaService } from './prisma.service';

interface Message {
  title: string;
  body: string;
  orderId?: string;
}

/** Уведомления: запись в «колокольчик» приложения + push через Expo. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async toUsers(userIds: string[], msg: Message) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, ...msg })),
    });
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: ids } } });
    // Android — напрямую через Firebase, остальное (iOS / Expo Go) — через Expo
    const fcm = tokens.filter((t) => t.platform === 'fcm').map((t) => t.token);
    const expo = tokens.filter((t) => t.platform !== 'fcm').map((t) => t.token);
    await this.sendPush(expo, msg);
    if (fcm.length) {
      try {
        const dead = await sendFcm(fcm, msg);
        if (dead.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      } catch (e) {
        this.logger.warn(`FCM push не отправлен: ${(e as Error).message}`);
      }
    }
  }

  async toRoles(roles: Role[], msg: Message) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, status: 'ACTIVE' },
      select: { id: true },
    });
    await this.toUsers(
      users.map((u) => u.id),
      msg,
    );
  }

  async toPartner(partnerId: string, msg: Message) {
    const users = await this.prisma.user.findMany({
      where: { partnerId, status: 'ACTIVE' },
      select: { id: true },
    });
    await this.toUsers(
      users.map((u) => u.id),
      msg,
    );
  }

  private async sendPush(tokens: string[], msg: Message) {
    if (!tokens.length) return;
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: msg.title,
      body: msg.body,
      data: msg.orderId ? { orderId: msg.orderId } : {},
    }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) this.logger.warn(`Expo push: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Expo push не отправлен: ${(e as Error).message}`);
    }
  }
}
