import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

  /** Партнёр: дата доставки YYYY-MM-DD */
  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /** QR | BANK | CASH */
  @IsOptional()
  @IsIn(['QR', 'BANK', 'CASH'])
  paymentMethod?: 'QR' | 'BANK' | 'CASH';

  /** Гость кофейни: филиал и время самовывоза (ISO) */
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  pickupAt?: string;
}

export class ConfirmDto {
  /** Можно уточнить способ оплаты при подтверждении */
  @IsOptional()
  @IsIn(['QR', 'BANK', 'CASH'])
  paymentMethod?: 'QR' | 'BANK' | 'CASH';

  /** Наличные: деньги уже получены (иначе — получим при выдаче или доставке) */
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
  @IsIn(['IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED'])
  status: 'IN_PRODUCTION' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

  /** Причина отклонения/отмены или комментарий к смене статуса */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /** Для DELIVERED: кто принял заказ */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedBy?: string;

  /** Для DELIVERED: курьер получил наличные */
  @IsOptional()
  @IsBoolean()
  cashReceived?: boolean;
}

export class PaymentDto {
  /** Способ оплаты: пока свободный текст, способ ещё выбирается */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export const orderInclude = {
  partner: { include: { priceType: true } },
  branch: { select: { id: true, name: true, address: true, phone: true, lat: true, lng: true } },
  items: { include: { product: { include: { category: true } } } },
  createdBy: { select: { id: true, name: true, role: true, phone: true } },
  courier: { select: { id: true, name: true, phone: true } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Заказ для ответа API: Decimal → number, дата доставки → YYYY-MM-DD. */
/** Кто покупатель: название партнёра или имя гостя. */
export function buyerName(o: { partner: { name: string } | null; createdBy?: { name: string | null } | null }) {
  return o.partner?.name ?? o.createdBy?.name ?? 'Гость';
}

export function serializeOrder(o: FullOrder) {
  return {
    ...o,
    buyer: buyerName(o),
    deliveryDate: fromDbDate(o.deliveryDate),
    total: Number(o.total),
    discount: Number(o.discount),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      unit: i.unit,
      qty: Number(i.qty),
      price: Number(i.price),
      sum: Number(i.sum),
      promo: i.promo,
      freeQty: i.freeQty,
      photoUrl: i.product.photoUrl,
      category: i.product.category.name,
      multiplicity: Number(i.product.multiplicity),
    })),
  };
}
