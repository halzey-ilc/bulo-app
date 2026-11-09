import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class NomenclatureGroup {
  @IsString() id: string;
  @IsString() name: string;
}

export class NomenclatureItem {
  @IsString() id: string;
  @IsString() name: string;
  @IsString() groupId: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0.001) multiplicity?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() weight?: string;
  @IsOptional() @IsString() shelfLife?: string;
}

export class NomenclatureDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => NomenclatureGroup) groups: NomenclatureGroup[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => NomenclatureItem) items: NomenclatureItem[];
}

export class PriceTypeItem {
  @IsString() id: string;
  @IsString() name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class PriceTypesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceTypeItem) items: PriceTypeItem[];
}

export class PriceItem {
  @IsString() productId: string;
  @IsString() priceTypeId: string;
  @IsNumber() @Min(0) price: number;
}

export class PricesImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceItem) items: PriceItem[];
}

export class CounterpartyItem {
  @IsString() id: string;
  @IsString() name: string;
  @IsOptional() @IsString() inn?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
}

export class CounterpartiesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CounterpartyItem) items: CounterpartyItem[];
}

export class AckDto {
  @IsBoolean() ok: boolean;
  /** Номер созданного документа в 1С */
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() error?: string;
}

export class StockItem {
  /** Код номенклатуры в 1С */
  @IsString() productId: string;
  /** Код склада в 1С */
  @IsString() warehouseId: string;
  @IsNumber() qty: number;
}

export class StockImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => StockItem) items: StockItem[];
  /** true (по умолчанию) — полный список по складам из пакета */
  @IsOptional() @IsBoolean() replace?: boolean;
}
