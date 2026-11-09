import { BadRequestException, Body, Controller, Delete, Get, HttpException, HttpStatus, Ip, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, publicUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { RoutingService } from '../delivery/routing.service';
import { AuthService } from './auth.service';
import {
  AddressDto,
  ChangePasswordDto,
  OtpLoginDto,
  PasswordLoginDto,
  PushTokenDto,
  RegisterPartnerDto,
  RequestOtpDto,
  UpdateMeDto,
  VerifyOtpDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** Сколько кодов уже запросили: с одного адреса и всего за час — защита от массовой рассылки SMS. */
  private otpHits = new Map<string, number[]>();
  private otpHour: number[] = [];

  @Public()
  @Post('otp')
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string, @CurrentUser() user?: AuthUser) {
    const now = Date.now();
    const recent = (this.otpHits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
    this.otpHour = this.otpHour.filter((t) => now - t < 60 * 60_000);
    if (recent.length >= 5) throw new HttpException('Слишком много запросов кода. Попробуйте через 10 минут', HttpStatus.TOO_MANY_REQUESTS);
    if (this.otpHour.length >= 300) throw new HttpException('Сервис входа перегружен, попробуйте чуть позже', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.otpHits.set(ip, recent);
    this.otpHour.push(now);
    if (this.otpHits.size > 5000) this.otpHits.clear();
    return this.auth.requestOtp(dto, user);
  }

  @Public()
  @Post('login/otp')
  loginOtp(@Body() dto: OtpLoginDto) {
    return this.auth.loginWithOtp(dto.phone, dto.code, dto.name);
  }

  @Public()
  @Post('login')
  login(@Body() dto: PasswordLoginDto) {
    return this.auth.loginWithPassword(dto.login, dto.password);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterPartnerDto) {
    return this.auth.registerPartner(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return publicUser(user);
  }

  /** Удалить свой аккаунт. */
  @Delete('me')
  deleteMe(@CurrentUser() user: AuthUser) {
    return this.auth.deleteAccount(user);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: dto,
      include: { partner: true },
    });
    return publicUser(updated);
  }

  @Post('me/phone')
  changePhone(@CurrentUser() user: AuthUser, @Body() dto: VerifyOtpDto) {
    return this.auth.changePhone(user, dto.phone, dto.code);
  }

  @Post('me/password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  @Post('push-token')
  async pushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, platform: dto.platform, userId: user.id },
      update: { userId: user.id, platform: dto.platform },
    });
    return { ok: true };
  }

  @Delete('push-token/:token')
  async removePushToken(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
    return { ok: true };
  }
}

/** Адреса доставки партнёра. */
@Controller('me/addresses')
@Roles('PARTNER', 'GUEST', 'CLIENT')
export class AddressesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
  ) {}

  private partnerId(user: AuthUser) {
    if (!user.partnerId) throw new BadRequestException('Учётная запись не привязана к контрагенту');
    return user.partnerId;
  }

  /** Если точку на карте не поставили — пробуем найти по адресу. */
  private async withPoint(dto: AddressDto) {
    if (dto.lat != null && dto.lng != null) return dto;
    const p = await this.routing.geocode(dto.address);
    return p ? { ...dto, ...p } : dto;
  }

  /** Адреса, сначала те, куда возили последними (как «последние поездки» в такси). */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const partnerId = this.partnerId(user);
    const [list, used] = await Promise.all([
      this.prisma.address.findMany({ where: { partnerId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.order.groupBy({ by: ['deliveryAddress'], where: { partnerId }, _max: { createdAt: true }, _count: true }),
    ]);
    const byText = new Map(used.map((u) => [u.deliveryAddress, u]));
    return list
      .map((a) => {
        const u = byText.get(a.address);
        return { ...a, lastUsedAt: u?._max.createdAt ?? null, ordersCount: u?._count ?? 0 };
      })
      .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0) || b.createdAt.getTime() - a.createdAt.getTime());
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    const partnerId = this.partnerId(user);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { partnerId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...(await this.withPoint(dto)), partnerId } });
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddressDto) {
    const partnerId = this.partnerId(user);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { partnerId }, data: { isDefault: false } });
    }
    const before = await this.prisma.address.findFirst({ where: { id, partnerId } });
    // адрес поменяли без новой точки — старая точка больше не подходит
    const data = before && before.address !== dto.address && dto.lat == null ? await this.withPoint(dto) : dto;
    await this.prisma.address.updateMany({ where: { id, partnerId }, data });
    return this.prisma.address.findFirst({ where: { id, partnerId } });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.address.deleteMany({ where: { id, partnerId: this.partnerId(user) } });
    return { ok: true };
  }
}

/** «Колокольчик»: уведомления пользователя. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  @Post('read')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
