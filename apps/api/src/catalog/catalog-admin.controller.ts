import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Body,
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
import { FileInterceptor } from '@nestjs/platform-express';
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
import { diskStorage } from 'multer';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { CatalogService } from './catalog.service';

class CategoryDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() workshopArea?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
}

class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() workshopArea?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
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
}

class UpdatePriceTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

const UPLOAD_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const photoUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

const publicUrl = (file: string) => `${process.env.PUBLIC_URL ?? ''}/uploads/${file}`;

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
  async updateProduct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProductDto) {
    const p = await this.prisma.product.update({ where: { id }, data: dto });
    await this.audit.log(user.id, 'product.update', 'Product', id, dto as object);
    return p;
  }

  @Post('products/:id/photo')
  @UseInterceptors(photoUpload)
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Загрузите изображение JPG, PNG или WebP до 8 МБ');
    return this.prisma.product.update({ where: { id }, data: { photoUrl: publicUrl(file.filename) } });
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
