import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { photoUpload, publicUrl } from '../common/upload';
import { CatalogService } from './catalog.service';

class CategoryDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() workshopArea?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsBoolean() promoCoffee?: boolean;
}

class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() workshopArea?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsBoolean() promoCoffee?: boolean;
}

class ProductDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() composition?: string;
  @IsOptional() @IsString() weight?: string;
  @IsOptional() @IsString() shelfLife?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @IsPositive() multiplicity?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsBoolean() isNew?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class CreateProductDto extends ProductDto {
  @IsString() declare categoryId: string;
  @IsString() @MinLength(1) declare name: string;
}

class PriceItemDto {
  @IsString() priceTypeId: string;
  /** null — убрать цену этого типа */
  @IsOptional() @IsNumber() @Min(0) price: number | null;
}

class PricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  items: PriceItemDto[];
}

class PriceTypeDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isRetail?: boolean;
}

class UpdatePriceTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isRetail?: boolean;
}

/**
 * Товары, фото, цены и истории ведут админ и менеджер.
 * Кассир видит каталог и только отмечает «нет в наличии» / «снова есть».
 */
const CATALOG_STAFF = ['ADMIN', 'MANAGER', 'CASHIER'] as const;

/** Управление каталогом: категории, товары, фото, цены, видимость. */
@Controller('admin/catalog')
@Roles('ADMIN', 'MANAGER')
export class CatalogAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  @Get('categories')
  @Roles(...CATALOG_STAFF)
  categories() {
    return this.catalog.categories(true);
  }

  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    const count = await this.prisma.product.count({ where: { categoryId: id } });
    if (count) throw new BadRequestException('В категории есть товары — сначала перенесите или скройте их');
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  @Get('products')
  @Roles(...CATALOG_STAFF)
  async products() {
    const items = await this.prisma.product.findMany({
      include: { category: true, prices: { include: { priceType: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map((p) => ({
      ...p,
      multiplicity: Number(p.multiplicity),
      prices: p.prices.map((x) => ({ ...x, price: Number(x.price) })),
    }));
  }

  @Post('products')
  async createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    const p = await this.prisma.product.create({ data: dto });
    await this.audit.log(user.id, 'product.create', 'Product', p.id);
    return p;
  }

  @Patch('products/:id')
  @Roles(...CATALOG_STAFF)
  async updateProduct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProductDto) {
    // кассир у существующих товаров только включает и выключает наличие
    // (у DTO объявленные, но не переданные поля тоже есть как ключи со значением undefined)
    const sent = Object.entries(dto).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (user.role === 'CASHIER' && sent.some((k) => k !== 'visible')) {
      throw new ForbiddenException('Кассир может только убрать товар или вернуть его в продажу');
    }
    const p = await this.prisma.product.update({ where: { id }, data: dto });
    await this.audit.log(user.id, 'product.update', 'Product', id, dto as object);
    return p;
  }

  @Post('products/:id/photo')
  @UseInterceptors(photoUpload)
  async uploadPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Загрузите изображение JPG, PNG или WebP до 8 МБ');
    const p = await this.prisma.product.update({ where: { id }, data: { photoUrl: publicUrl(file.filename) } });
    await this.audit.log(user.id, 'product.photo', 'Product', id);
    return p;
  }

  /** Удалить товар. Если его уже заказывали, товар только скрывается, чтобы не ломать историю заказов. */
  @Delete('products/:id')
  async deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const used = await this.prisma.orderItem.count({ where: { productId: id } });
    if (used) {
      await this.prisma.product.update({ where: { id }, data: { visible: false } });
      await this.audit.log(user.id, 'product.hide', 'Product', id);
      return { ok: true, hidden: true };
    }
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log(user.id, 'product.delete', 'Product', id);
    return { ok: true, hidden: false };
  }

  @Put('products/:id/prices')
  async setPrices(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PricesDto) {
    await this.prisma.$transaction(
      dto.items.map((i) =>
        i.price == null
          ? this.prisma.price.deleteMany({ where: { productId: id, priceTypeId: i.priceTypeId } })
          : this.prisma.price.upsert({
              where: { productId_priceTypeId: { productId: id, priceTypeId: i.priceTypeId } },
              create: { productId: id, priceTypeId: i.priceTypeId, price: i.price },
              update: { price: i.price },
            }),
      ),
    );
    await this.audit.log(user.id, 'product.prices', 'Product', id, dto.items as unknown as object);
    return { ok: true };
  }

  @Get('price-types')
  @Roles(...CATALOG_STAFF)
  priceTypes() {
    return this.prisma.priceType.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { partners: true } } },
    });
  }

  @Post('price-types')
  async createPriceType(@Body() dto: PriceTypeDto) {
    if (dto.isDefault) await this.prisma.priceType.updateMany({ data: { isDefault: false } });
    return this.prisma.priceType.create({ data: dto });
  }

  @Patch('price-types/:id')
  async updatePriceType(@Param('id') id: string, @Body() dto: UpdatePriceTypeDto) {
    if (dto.isDefault) await this.prisma.priceType.updateMany({ data: { isDefault: false } });
    return this.prisma.priceType.update({ where: { id }, data: dto });
  }
}
