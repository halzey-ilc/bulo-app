import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const ROLES = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER', 'PARTNER', 'GUEST'] as const;
type AssignableRole = (typeof ROLES)[number];

export class PartnerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() inn?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() priceTypeId?: string | null;
  @IsOptional() @IsString() oneCId?: string | null;
  @IsOptional() @IsString() note?: string;
}

export class CreatePartnerDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() inn?: string;
  @IsString() @MinLength(2) contactName: string;
  @IsString() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() priceTypeId?: string;
  @IsOptional() @IsString() oneCId?: string;
  @IsOptional() @IsString() address?: string;
  /** Сразу создать пользователя-партнёра с этим телефоном (вход по СМС) */
  @IsOptional() @IsBoolean() createUser?: boolean;
}

export class ApprovePartnerDto {
  @IsOptional() @IsString() priceTypeId?: string;
  @IsOptional() @IsString() oneCId?: string;
}

export class ReasonDto {
  @IsString() @MinLength(2) reason: string;
}

export class CreateUserDto {
  @IsString() @MinLength(2) name: string;

  @IsIn(ROLES) role: AssignableRole;

  /** Вход по СМС-коду */
  @ValidateIf((o) => !o.login)
  @IsString()
  phone?: string;

  /** Вход по логину и паролю (гости, сотрудники веб-панели) */
  @ValidateIf((o) => !o.phone || o.login)
  @IsString()
  @Matches(/^[a-z0-9._-]{3,32}$/i, { message: 'Логин: 3–32 символа, латиница, цифры, . _ -' })
  login?: string;

  @ValidateIf((o) => !!o.login)
  @IsString()
  @MinLength(6, { message: 'Пароль — минимум 6 символов' })
  password?: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() accessExpiresAt?: string;
  @IsOptional() @IsBoolean() canOrder?: boolean;
  @IsOptional() @IsString() partnerId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsIn(ROLES) role?: AssignableRole;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() login?: string | null;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['ACTIVE', 'BLOCKED']) status?: 'ACTIVE' | 'BLOCKED';
  @IsOptional() @IsDateString() accessExpiresAt?: string | null;
  @IsOptional() @IsBoolean() canOrder?: boolean;
  @IsOptional() @IsString() partnerId?: string | null;
}

export class SettingsDto {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Время в формате ЧЧ:ММ' }) cutoffTime?: string;
  @IsOptional() @IsNumber() @Min(0) minOrderSum?: number;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() workHours?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() telegram?: string;
}
