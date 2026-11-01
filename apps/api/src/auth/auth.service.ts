import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { AuthUser, publicUser } from '../common/auth-user';
import { NotificationsService } from '../common/notifications.service';
import { PrismaService } from '../common/prisma.service';
import type { RegisterPartnerDto, RequestOtpDto } from './dto';
import { OtpService } from './otp.service';
import { normalizePhone } from './phone';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  phoneOrThrow(raw: string) {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException('Некорректный номер телефона');
    return phone;
  }

  async requestOtp(dto: RequestOtpDto, current?: AuthUser) {
    const phone = this.phoneOrThrow(dto.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (dto.purpose === 'LOGIN' && !existing) {
      throw new NotFoundException('Номер не найден. Подайте заявку партнёра или обратитесь к администратору');
    }
    if (dto.purpose === 'REGISTER' && existing) {
      throw new ConflictException('Этот номер уже зарегистрирован — войдите');
    }
    if (dto.purpose === 'CHANGE_PHONE') {
      if (!current) throw new UnauthorizedException('Требуется вход');
      if (existing) throw new ConflictException('Этот номер уже используется');
    }
    if (existing) this.assertCanLogin(existing as AuthUser);
    return { sent: true, phone, ...(await this.otp.send(phone, dto.purpose)) };
  }

  async loginWithOtp(rawPhone: string, code: string) {
    const phone = this.phoneOrThrow(rawPhone);
    await this.otp.verify(phone, 'LOGIN', code);
    const user = await this.prisma.user.findUnique({ where: { phone }, include: { partner: true } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return this.issue(user);
  }

  async loginWithPassword(login: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { login: login.trim().toLowerCase() },
      include: { partner: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    return this.issue(user);
  }

  /** Заявка лавки-партнёра: создаёт контрагента (ждёт одобрения) и пользователя-партнёра. */
  async registerPartner(dto: RegisterPartnerDto) {
    const phone = this.phoneOrThrow(dto.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw new ConflictException('Этот номер уже зарегистрирован — войдите');
    }
    await this.otp.verify(phone, 'REGISTER', dto.code);
    const user = await this.prisma.user.create({
      data: {
        phone,
        name: dto.contactName,
        email: dto.email,
        role: 'PARTNER',
        partner: {
          create: {
            name: dto.partnerName,
            inn: dto.inn,
            contactName: dto.contactName,
            phone,
            email: dto.email,
            addresses: { create: { address: dto.address, isDefault: true } },
          },
        },
      },
      include: { partner: true },
    });
    await this.audit.log(user.id, 'partner.register', 'Partner', user.partnerId!);
    await this.notifications.toRoles(['ADMIN', 'MANAGER'], {
      title: 'Новая заявка партнёра',
      body: `${dto.partnerName} (${dto.contactName}, ${phone})`,
    });
    return this.issue(user);
  }

  async changePhone(user: AuthUser, rawPhone: string, code: string) {
    const phone = this.phoneOrThrow(rawPhone);
    await this.otp.verify(phone, 'CHANGE_PHONE', code);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { phone },
      include: { partner: true },
    });
    await this.audit.log(user.id, 'user.change_phone', 'User', user.id, { from: user.phone, to: phone });
    return publicUser(updated);
  }

  /** Смена своего пароля. Остальные сессии пользователя завершаются, текущей выдаётся новый токен. */
  async changePassword(user: AuthUser, current: string | undefined, next: string) {
    if (user.passwordHash && !(current && (await bcrypt.compare(current, user.passwordHash)))) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
      include: { partner: true },
    });
    await this.audit.log(user.id, 'user.change_password', 'User', user.id);
    const token = await this.jwt.signAsync({ sub: updated.id, v: updated.tokenVersion });
    return { token, user: publicUser(updated) };
  }

  private assertCanLogin(user: AuthUser) {
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Учётная запись заблокирована');
    if (user.accessExpiresAt && user.accessExpiresAt < new Date()) {
      throw new ForbiddenException('Срок доступа истёк — обратитесь к администратору');
    }
    if (user.partner?.status === 'BLOCKED') throw new ForbiddenException('Доступ партнёра заблокирован');
  }

  private async issue(user: AuthUser) {
    this.assertCanLogin(user);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await this.jwt.signAsync({ sub: user.id, v: user.tokenVersion });
    return { token, user: publicUser(user) };
  }
}
