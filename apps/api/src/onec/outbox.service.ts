import { Injectable } from '@nestjs/common';
import { OneCDocType, Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../common/stock.service';

/**
 * Исходящие документы для 1С. Ставятся в очередь при подтверждении заказа (списание),
 * отгрузке/выдаче (реализация), отмене и сводной накладной. 1С забирает их через /api/onec/outbox,
 * мы отправляем их сами (если заданы адрес и логин 1С) или бухгалтер выгружает их в Excel.
 */
@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async enqueueOrder(orderId: string, type: Extract<OneCDocType, 'CUSTOMER_ORDER' | 'SALE' | 'CANCEL'>) {
    // каждый документ по заказу — один раз: повтор не должен списать товар в 1С дважды
    const existing = await this.prisma.oneCDocument.findFirst({ where: { orderId, type } });
    if (existing) return existing;
    const o = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        partner: { include: { priceType: true } },
        branch: { include: { priceType: true } },
        createdBy: { select: { name: true, phone: true } },
        items: { include: { product: true } },
      },
    });
    const payload = {
      orderNumber: o.number,
      channel: o.channel,
      date: o.createdAt.toISOString(),
      deliveryDate: fromDbDate(o.deliveryDate),
      pickupAt: o.pickupAt?.toISOString() ?? null,
      shippedAt: o.shippedAt?.toISOString() ?? null,
      /** Склад списания в 1С: склад филиала или цеха */
      warehouse: await this.stock.warehouseFor(o),
      branch: o.branch ? { name: o.branch.name, warehouse: o.branch.oneCWarehouseId } : null,
      counterparty: o.partner
        ? { oneCId: o.partner.oneCId, name: o.partner.name, inn: o.partner.inn }
        : { oneCId: null, name: `Гость: ${o.createdBy.name}`, inn: null, phone: o.createdBy.phone },
      priceType: (o.partner?.priceType ?? o.branch?.priceType)?.oneCId ?? null,
      deliveryAddress: o.deliveryAddress,
      comment: o.comment,
      paid: !!o.paidAt,
      paymentMethod: o.paymentMethod,
      discount: Number(o.discount),
      items: o.items.map((i) => ({
        productOneCId: i.product.oneCId,
        name: i.name,
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        sum: Number(i.sum),
        free: i.freeQty,
      })),
      total: Number(o.total),
    };
    return this.prisma.oneCDocument.create({
      data: { type, orderId, payload: payload as Prisma.InputJsonValue },
    });
  }

  async enqueueProduction(sheetId: string, items: { productOneCId: string | null; name: string; unit: string; qty: number }[]) {
    const sheet = await this.prisma.productionSheet.findUniqueOrThrow({ where: { id: sheetId } });
    const payload = {
      sheetNumber: sheet.number,
      date: fromDbDate(sheet.date),
      isSupplement: sheet.isSupplement,
      items,
    };
    return this.prisma.oneCDocument.create({
      data: { type: 'PRODUCTION', productionSheetId: sheetId, payload: payload as Prisma.InputJsonValue },
    });
  }
}
