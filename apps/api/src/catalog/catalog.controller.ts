import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { SettingsService } from '../common/settings.service';
import { CatalogService } from './catalog.service';

/** Публичный каталог: видят все, цены — только те, кому положено. */
@Controller()
@Public()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  @Get('catalog/categories')
  categories() {
    return this.catalog.categories();
  }

  @Get('catalog/products')
  products(
    @CurrentUser() user: AuthUser | undefined,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('isNew') isNew?: string,
  ) {
    return this.catalog.products(user, { categoryId, search, isNew: isNew === 'true' });
  }

  @Get('catalog/products/:id')
  product(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string) {
    return this.catalog.product(user, id);
  }

  /** Контакты компании и правила заказа — для экрана «О нас» и корзины. */
  @Get('info')
  async info() {
    const s = await this.settings.get();
    return { ...s, minOrderSum: Number(s.minOrderSum) };
  }
}
