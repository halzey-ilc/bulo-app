import { Injectable } from '@nestjs/common';
import { OneCDocType, Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';
import { PrismaService } from '../common/prisma.service';

/**
 * Исходящие документы для 1С. Ставятся в очередь при смене статуса заказа
 * и при формировании сводной накладной; 1С забирает их через /api/onec/outbox
 * или бухгалтер выгружает их в Excel.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueOrder(orderId: string, type: Extract<OneCDocType, 'CUSTOMER_ORDER' | 'SALE'>) {
    const o = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { partner: { include: { priceType: true } }, items: { include: { product: true } } },
    });
    const payload = {
      orderNumber: o.number,
      date: o.createdAt.toISOString(),
      deliveryDate: fromDbDate(o.deliveryDate),
      shippedAt: o.shippedAt?.toISOString() ?? null,
      counterparty: {
        oneCId: o.partner.oneCId,
        name: o.partner.name,
        inn: o.partner.inn,
      },
      priceType: o.partner.priceType?.oneCId ?? null,
      deliveryAddress: o.deliveryAddress,
      comment: o.comment,
      paid: !!o.paidAt,
      paymentMethod: o.paymentMethod,
      items: o.items.map((i) => ({
        productOneCId: i.product.oneCId,
        name: i.name,
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        sum: Number(i.sum),
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
