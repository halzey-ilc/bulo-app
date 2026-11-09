import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, canSeePrices, isStaff } from '../common/auth-user';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../common/stock.service';

const productInclude = { category: true, prices: true } satisfies Prisma.ProductInclude;
type ProductWithPrices = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/**
 * Чьими глазами смотрим каталог.
 * cafe — меню филиала с его ценами (видят все, даже без входа);
 * partner — оптовый каталог по типу цен партнёра (цены только одобренным).
 */
export interface CatalogView {
  mode: 'cafe' | 'partner';
  priceTypeId: string | null;
  branchId: string | null;
  warehouseId: string | null;
  showPrices: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  /** Тип цен партнёра: индивидуальный у контрагента или тип по умолчанию. */
  async priceTypeIdFor(user?: AuthUser | null): Promise<string | null> {
    if (user?.partner?.priceTypeId) return user.partner.priceTypeId;
    const def = await this.prisma.priceType.findFirst({ where: { isDefault: true } });
    return def?.id ?? null;
  }

  async view(user: AuthUser | undefined, branchId?: string): Promise<CatalogView> {
    const partnerView = !branchId && (!!user?.partnerId || (isStaff(user) && user?.role !== 'CASHIER'));
    if (partnerView) {
      return {
        mode: 'partner',
        priceTypeId: await this.priceTypeIdFor(user),
        branchId: null,
        warehouseId: null,
        showPrices: canSeePrices(user),
      };
    }
    const branch =
      (branchId && (await this.prisma.branch.findFirst({ where: { id: branchId } }))) ||
      (user?.branchId && (await this.prisma.branch.findFirst({ where: { id: user.branchId, active: true } }))) ||
      (await this.prisma.branch.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } }));
    return {
      mode: 'cafe',
      priceTypeId: branch?.priceTypeId ?? null,
      branchId: branch?.id ?? null,
      warehouseId: branch?.oneCWarehouseId ?? null,
      showPrices: true,
    };
  }

  /** Категории; для покупателя — только те, где есть товары с ценой в его каталоге. */
  async categories(includeHidden = false, view?: CatalogView) {
    const productWhere: Prisma.ProductWhereInput = includeHidden
      ? {}
      : { visible: true, ...(view?.priceTypeId ? { prices: { some: { priceTypeId: view.priceTypeId } } } : {}) };
    const cats = await this.prisma.category.findMany({
      where: includeHidden ? {} : { visible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: productWhere } } } },
    });
    return includeHidden ? cats : cats.filter((c) => c._count.products > 0);
  }

  async products(
    user: AuthUser | undefined,
    q: { categoryId?: string; search?: string; isNew?: boolean; branchId?: string },
  ) {
    const view = await this.view(user, q.branchId);
    const items = await this.prisma.product.findMany({
      where: {
        visible: true,
        category: { visible: true },
        categoryId: q.categoryId || undefined,
        isNew: q.isNew || undefined,
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
        // товар есть в этом каталоге, только если у него есть цена этого типа
        ...(view.priceTypeId ? { prices: { some: { priceTypeId: view.priceTypeId } } } : { id: '__none__' }),
      },
      include: productInclude,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.withPrices(items, view);
  }

  async product(user: AuthUser | undefined, id: string, branchId?: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, visible: true },
      include: productInclude,
    });
    if (!p) throw new NotFoundException('Товар не найден');
    return (await this.withPrices([p], await this.view(user, branchId)))[0];
  }

  /** Подставляет цену по типу цен и свободный остаток; анонимам в оптовом каталоге — price: null. */
  private async withPrices(items: ProductWithPrices[], view: CatalogView) {
    const stock = view.mode === 'cafe' ? await this.stock.available(items.map((p) => p.id), view.warehouseId) : new Map<string, number>();
    return items.map(({ prices, ...p }) => {
      const price = view.showPrices ? prices.find((x) => x.priceTypeId === view.priceTypeId)?.price ?? null : null;
      return {
        ...p,
        multiplicity: Number(p.multiplicity),
        price: price == null ? null : Number(price),
        pricesHidden: !view.showPrices,
        promo: p.category.promoCoffee,
        /** Свободный остаток из 1С; null — не отслеживается */
        stock: stock.has(p.id) ? stock.get(p.id)! : null,
        branchId: view.branchId,
      };
    });
  }
}
