import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SettingsService } from './settings.service';

/**
 * Остатки. Источник правды — 1С: она присылает остатки по складам (или мы забираем их сами).
 * Свободный остаток = остаток 1С минус подтверждённые заказы, которые 1С ещё не приняла
 * (их документ в очереди). Как только 1С подтвердила документ, он уже учтён в её остатках.
 * Если по товару остатков из 1С нет — считаем, что ограничения нет.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Склад, с которого списывается заказ: склад филиала или склад цеха. */
  async warehouseFor(order: { channel: 'PARTNER' | 'CAFE'; branchId: string | null }): Promise<string | null> {
    if (order.channel === 'CAFE' && order.branchId) {
      const b = await this.prisma.branch.findUnique({ where: { id: order.branchId }, select: { oneCWarehouseId: true } });
      return b?.oneCWarehouseId ?? null;
    }
    return (await this.settings.get()).workshopWarehouseId ?? null;
  }

  /** productId → свободный остаток. В ответе только товары, по которым 1С присылала остатки. */
  async available(productIds: string[], warehouseId: string | null): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!warehouseId || !productIds.length) return out;
    const rows = await this.prisma.stock.findMany({ where: { warehouseId, productId: { in: productIds } } });
    if (!rows.length) return out;
    for (const r of rows) out.set(r.productId, Number(r.qty));

    const settings = await this.settings.get();
    const branch = await this.prisma.branch.findUnique({ where: { oneCWarehouseId: warehouseId }, select: { id: true } });
    const reserved = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { qty: true },
      where: {
        productId: { in: rows.map((r) => r.productId) },
        order: {
          confirmedAt: { not: null },
          status: { notIn: ['REJECTED', 'CANCELLED'] },
          oneCDocs: { some: { type: 'CUSTOMER_ORDER', status: { in: ['PENDING', 'ERROR'] } } },
          OR: [
            ...(branch ? [{ branchId: branch.id }] : []),
            ...(settings.workshopWarehouseId === warehouseId ? [{ channel: 'PARTNER' as const }] : []),
          ],
        },
      },
    });
    for (const r of reserved) {
      out.set(r.productId, Math.max(0, (out.get(r.productId) ?? 0) - Number(r._sum.qty ?? 0)));
    }
    return out;
  }
}
