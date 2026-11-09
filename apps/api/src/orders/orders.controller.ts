import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { OrderChannel, OrderStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { SettingsService } from '../common/settings.service';
import { photoUpload, publicUrl } from '../common/upload';
import { ConfirmDto, CreateOrderDto, PaymentDto, StatusDto, UpdateItemsDto } from './order-dto';
import { earliestDeliveryDate } from './order-rules';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  /** Правила оформления для корзины: ближайшая дата, отсечка, минимальная сумма. */
  @Get('rules')
  @Public()
  async rules() {
    const s = await this.settings.get();
    return {
      cutoffTime: s.cutoffTime,
      minOrderSum: Number(s.minOrderSum),
      earliestDeliveryDate: earliestDeliveryDate(s.cutoffTime),
      promo: { enabled: s.promoEnabled, every: s.promoEvery },
      payment: { qr: !!s.qrPayload, bank: !!(s.bankAccount || s.bankName) },
    };
  }

  @Post()
  @Roles('PARTNER', 'GUEST', 'CLIENT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  /** Карта гостя «7-й кофе бесплатно». */
  @Get('loyalty')
  @Roles('PARTNER', 'GUEST', 'CLIENT')
  loyalty(@CurrentUser() user: AuthUser) {
    return this.orders.loyalty(user);
  }

  /**
   * Список заказов. Партнёр видит свои, сотрудники — по своей роли.
   * status можно передать через запятую: status=READY,SHIPPED; paid=true|false — по оплате;
   * channel=CAFE|PARTNER; awaiting=true — ждут подтверждения.
   */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('partnerId') partnerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('paid') paid?: string,
    @Query('channel') channel?: string,
    @Query('branchId') branchId?: string,
    @Query('awaiting') awaiting?: string,
  ) {
    const statuses = status?.split(',').filter(Boolean) as OrderStatus[] | undefined;
    return this.orders.list(user, {
      status: statuses && statuses.length > 1 ? statuses : statuses?.[0],
      partnerId,
      dateFrom,
      dateTo,
      search,
      paid: paid === 'true' ? true : paid === 'false' ? false : undefined,
      channel: channel === 'CAFE' || channel === 'PARTNER' ? (channel as OrderChannel) : undefined,
      branchId,
      awaiting: awaiting === 'true',
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.get(user, id);
  }

  /** Как оплатить: QR с суммой и реквизиты расчётного счёта. */
  @Get(':id/payment')
  payment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.payment(user, id);
  }

  /** «Я оплатил» — по желанию с фото чека (multipart, поле file). */
  @Post(':id/paid')
  @Roles('PARTNER', 'GUEST', 'CLIENT')
  @UseInterceptors(photoUpload)
  claimPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.orders.claimPaid(user, id, file ? publicUrl(file.filename) : undefined);
  }

  /** Подтвердить заказ после оплаты: дальше цех и списание в 1С. */
  @Post(':id/confirm')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConfirmDto) {
    return this.orders.confirm(user, id, dto);
  }

  @Patch(':id/items')
  @Roles('ADMIN', 'MANAGER')
  updateItems(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItemsDto) {
    return this.orders.updateItems(user, id, dto.items, dto.comment);
  }

  @Post(':id/status')
  changeStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.orders.changeStatus(user, id, dto);
  }

  /** Деньги получены (наличные при доставке/выдаче, запоздалый перевод). */
  @Post(':id/payment')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PaymentDto) {
    return this.orders.markPaid(user, id, dto.paymentMethod, dto.comment);
  }
}
