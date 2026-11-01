import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, publicUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from './auth.service';
import {
  AddressDto,
  ChangePasswordDto,
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

  @Public()
  @Post('otp')
  requestOtp(@Body() dto: RequestOtpDto, @CurrentUser() user?: AuthUser) {
    return this.auth.requestOtp(dto, user);
  }

  @Public()
  @Post('login/otp')
  loginOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.loginWithOtp(dto.phone, dto.code);
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
  constructor(private readonly prisma: PrismaService) {}

  private partnerId(user: AuthUser) {
    if (!user.partnerId) throw new BadRequestException('Учётная запись не привязана к контрагенту');
    return user.partnerId;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.address.findMany({
      where: { partnerId: this.partnerId(user) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    const partnerId = this.partnerId(user);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { partnerId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...dto, partnerId } });
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddressDto) {
    const partnerId = this.partnerId(user);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { partnerId }, data: { isDefault: false } });
    }
    await this.prisma.address.updateMany({ where: { id, partnerId }, data: dto });
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
