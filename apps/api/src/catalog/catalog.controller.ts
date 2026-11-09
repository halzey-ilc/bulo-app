import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser, isStaff } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { pickupSlots } from '../orders/pickup';
import { CatalogService } from './catalog.service';

/** Публичный каталог: меню филиалов видят все, оптовые цены — только партнёры. */
@Controller()
@Public()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('catalog/categories')
  async categories(@CurrentUser() user: AuthUser | undefined, @Query('branchId') branchId?: string) {
    return this.catalog.categories(false, await this.catalog.view(user, branchId));
  }

  @Get('catalog/products')
  products(
    @CurrentUser() user: AuthUser | undefined,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('isNew') isNew?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.catalog.products(user, { categoryId, search, isNew: isNew === 'true', branchId });
  }

  @Get('catalog/products/:id')
  product(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string, @Query('branchId') branchId?: string) {
    return this.catalog.product(user, id, branchId);
  }

  /** Филиалы кофейни: адрес, часы, есть ли меню. */
  @Get('branches')
  async branches() {
    const list = await this.prisma.branch.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { priceType: { include: { _count: { select: { prices: true } } } } },
    });
    return list.map(({ priceType, oneCWarehouseId, ...b }) => ({ ...b, menuSize: priceType._count.prices }));
  }

  /** Свободное время для брони в филиале. */
  @Get('branches/:id/slots')
  async slots(@Param('id') id: string) {
    const b = await this.prisma.branch.findFirstOrThrow({ where: { id } });
    return { opensAt: b.opensAt, closesAt: b.closesAt, ...pickupSlots(b.opensAt, b.closesAt) };
  }

  /** Истории на главной: гостям — для кофейни, партнёрам — для партнёров. */
  @Get('stories')
  async stories(@CurrentUser() user: AuthUser | undefined) {
    const audience = user?.partnerId ? 'PARTNER' : isStaff(user) ? undefined : 'CAFE';
    const now = new Date();
    return this.prisma.story.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(audience ? { audience: { in: ['ALL', audience] } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Контакты компании и правила заказа — для экрана «О нас» и корзины. */
  @Get('info')
  async info() {
    const s = await this.settings.get();
    const { qrPayload, workshopWarehouseId, ...rest } = s;
    return { ...rest, minOrderSum: Number(s.minOrderSum) };
  }
}
