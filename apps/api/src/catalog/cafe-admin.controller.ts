import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { photoUpload, publicUrl } from '../common/upload';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

class BranchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Matches(TIME, { message: 'Время в формате ЧЧ:ММ' }) opensAt?: string;
  @IsOptional() @Matches(TIME, { message: 'Время в формате ЧЧ:ММ' }) closesAt?: string;
  @IsOptional() @IsString() oneCWarehouseId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class CreateBranchDto extends BranchDto {
  @IsString() @MinLength(2) declare name: string;
}

class CopyPricesDto {
  @IsString() fromBranchId: string;
  /** −15 — на 15% дешевле, 0 — те же цены */
  @IsNumber() @Min(-90) @Max(200) percent: number;
  /** Округлять до 10 сом */
  @IsOptional() @IsBoolean() round10?: boolean;
  /** Перезаписать цены, которые уже стоят */
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

class StoryDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @IsIn(['ALL', 'CAFE', 'PARTNER']) audience?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

/** Филиалы кофейни и их меню. Ведут админ и менеджер. */
@Controller('admin/branches')
@Roles('ADMIN', 'MANAGER')
export class BranchesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'ACCOUNTANT')
  async list() {
    const list = await this.prisma.branch.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { priceType: { include: { _count: { select: { prices: true } } } } },
    });
    return list.map((b) => ({ ...b, menuSize: b.priceType._count.prices }));
  }

  /** Новый филиал сразу получает свой тип цен (розница филиала). */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    const priceType = await this.prisma.priceType.create({ data: { name: `Кофейня ${dto.name}`, isRetail: true } });
    const b = await this.prisma.branch.create({ data: { ...dto, priceTypeId: priceType.id } });
    await this.audit.log(user.id, 'branch.create', 'Branch', b.id);
    return b;
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BranchDto) {
    const b = await this.prisma.branch.update({ where: { id }, data: { ...dto, oneCWarehouseId: dto.oneCWarehouseId || undefined } });
    if (dto.name) await this.prisma.priceType.update({ where: { id: b.priceTypeId }, data: { name: `Кофейня ${dto.name}` } });
    await this.audit.log(user.id, 'branch.update', 'Branch', id, dto as object);
    return b;
  }

  /** Меню филиала из другого филиала: те же товары, цены с наценкой/скидкой в процентах. */
  @Post(':id/copy-prices')
  async copyPrices(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CopyPricesDto) {
    if (dto.fromBranchId === id) throw new BadRequestException('Выберите другой филиал');
    const [to, from] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({ where: { id } }),
      this.prisma.branch.findUniqueOrThrow({ where: { id: dto.fromBranchId } }),
    ]);
    const source = await this.prisma.price.findMany({ where: { priceTypeId: from.priceTypeId } });
    const existing = new Set(
      (await this.prisma.price.findMany({ where: { priceTypeId: to.priceTypeId }, select: { productId: true } })).map((p) => p.productId),
    );
    let copied = 0;
    for (const p of source) {
      if (existing.has(p.productId) && !dto.overwrite) continue;
      let price = Number(p.price) * (1 + dto.percent / 100);
      price = dto.round10 === false ? Math.round(price) : Math.round(price / 10) * 10;
      await this.prisma.price.upsert({
        where: { productId_priceTypeId: { productId: p.productId, priceTypeId: to.priceTypeId } },
        create: { productId: p.productId, priceTypeId: to.priceTypeId, price },
        update: { price },
      });
      copied++;
    }
    await this.audit.log(user.id, 'branch.copy_prices', 'Branch', id, { from: from.id, percent: dto.percent, copied });
    return { copied, total: source.length };
  }
}

/** Истории на главной. */
@Controller('admin/stories')
@Roles('ADMIN', 'MANAGER')
export class StoriesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.story.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  /** Новая история: multipart с картинкой (file) и полями title, caption, productId, audience. */
  @Post()
  @UseInterceptors(photoUpload)
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, string>, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Добавьте картинку JPG, PNG или WebP до 8 МБ');
    const title = (body.title ?? '').trim();
    if (!title) throw new BadRequestException('Напишите заголовок');
    const s = await this.prisma.story.create({
      data: {
        title,
        caption: body.caption?.trim() || null,
        productId: body.productId || null,
        audience: ['ALL', 'CAFE', 'PARTNER'].includes(body.audience) ? body.audience : 'ALL',
        imageUrl: publicUrl(file.filename),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    await this.audit.log(user.id, 'story.create', 'Story', s.id);
    return s;
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StoryDto) {
    const s = await this.prisma.story.update({
      where: { id },
      data: { ...dto, expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null },
    });
    await this.audit.log(user.id, 'story.update', 'Story', id, dto as object);
    return s;
  }

  @Post(':id/photo')
  @UseInterceptors(photoUpload)
  async photo(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Загрузите изображение JPG, PNG или WebP до 8 МБ');
    return this.prisma.story.update({ where: { id }, data: { imageUrl: publicUrl(file.filename) } });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.story.delete({ where: { id } });
    await this.audit.log(user.id, 'story.delete', 'Story', id);
    return { ok: true };
  }
}
