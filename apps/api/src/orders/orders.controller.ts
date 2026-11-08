import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { SettingsService } from '../common/settings.service';
import { CreateOrderDto, PaymentDto, StatusDto, UpdateItemsDto } from './order-dto';
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
    };
  }

  @Post()
  @Roles('PARTNER', 'GUEST', 'CLIENT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  /**
   * Список заказов. Партнёр видит свои, сотрудники — по своей роли.
   * status можно передать через запятую: status=READY,SHIPPED; paid=true|false — по оплате.
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
  ) {
    const statuses = status?.split(',').filter(Boolean) as OrderStatus[] | undefined;
    return this.orders.list(user, {
      status: statuses && statuses.length > 1 ? statuses : statuses?.[0],
      partnerId,
      dateFrom,
      dateTo,
      search,
      paid: paid === 'true' ? true : paid === 'false' ? false : undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.get(user, id);
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

  /** Отметить оплату. Статус заказа не меняется. */
  @Post(':id/payment')
  @Roles('ADMIN', 'ACCOUNTANT')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PaymentDto) {
    return this.orders.markPaid(user, id, dto.paymentMethod, dto.comment);
  }
}
