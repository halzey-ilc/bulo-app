import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';

export class OrderItemInput {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.001)
  qty: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];

  /** YYYY-MM-DD */
  @IsString()
  deliveryDate: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class StatusDto {
  @IsIn(['APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED'])
  status: 'APPROVED' | 'PAID' | 'IN_PRODUCTION' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

  /** Причина отклонения/отмены или комментарий к смене статуса */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /** Для PAID: способ оплаты (пока свободный текст — способ ещё выбирается) */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;
}

export const orderInclude = {
  partner: { include: { priceType: true } },
  items: { include: { product: { include: { category: true } } } },
  createdBy: { select: { id: true, name: true, role: true } },
  courier: { select: { id: true, name: true, phone: true } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Заказ для ответа API: Decimal → number, дата доставки → YYYY-MM-DD. */
export function serializeOrder(o: FullOrder) {
  return {
    ...o,
    deliveryDate: fromDbDate(o.deliveryDate),
    total: Number(o.total),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      unit: i.unit,
      qty: Number(i.qty),
      price: Number(i.price),
      sum: Number(i.sum),
      photoUrl: i.product.photoUrl,
      category: i.product.category.name,
      multiplicity: Number(i.product.multiplicity),
    })),
  };
}
