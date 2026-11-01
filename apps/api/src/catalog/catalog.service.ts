import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, canSeePrices } from '../common/auth-user';
import { PrismaService } from '../common/prisma.service';

const productInclude = { category: true, prices: true } satisfies Prisma.ProductInclude;
type ProductWithPrices = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Тип цен пользователя: индивидуальный у контрагента или тип по умолчанию. */
  async priceTypeIdFor(user?: AuthUser | null): Promise<string | null> {
    if (user?.partner?.priceTypeId) return user.partner.priceTypeId;
    const def = await this.prisma.priceType.findFirst({ where: { isDefault: true } });
    return def?.id ?? null;
  }

  categories(includeHidden = false) {
    return this.prisma.category.findMany({
      where: includeHidden ? {} : { visible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: includeHidden ? {} : { visible: true } } } } },
    });
  }

  async products(user: AuthUser | undefined, q: { categoryId?: string; search?: string; isNew?: boolean }) {
    const items = await this.prisma.product.findMany({
      where: {
        visible: true,
        category: { visible: true },
        categoryId: q.categoryId || undefined,
        isNew: q.isNew || undefined,
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: productInclude,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.withPrices(items, user);
  }

  async product(user: AuthUser | undefined, id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, visible: true },
      include: productInclude,
    });
    if (!p) throw new NotFoundException('Товар не найден');
    return (await this.withPrices([p], user))[0];
  }

  /** Подставляет цену по типу цен пользователя; анонимам и неодобренным — price: null. */
  private async withPrices(items: ProductWithPrices[], user?: AuthUser) {
    const show = canSeePrices(user);
    const priceTypeId = show ? await this.priceTypeIdFor(user) : null;
    return items.map(({ prices, ...p }) => {
      const price = show ? prices.find((x) => x.priceTypeId === priceTypeId)?.price ?? null : null;
      return {
        ...p,
        multiplicity: Number(p.multiplicity),
        price: price == null ? null : Number(price),
        pricesHidden: !show,
      };
    });
  }
}
