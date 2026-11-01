import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  phone: string;

  @IsIn(['LOGIN', 'REGISTER', 'CHANGE_PHONE'])
  purpose: 'LOGIN' | 'REGISTER' | 'CHANGE_PHONE';
}

export class VerifyOtpDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 6)
  code: string;
}

export class RegisterPartnerDto extends VerifyOtpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  partnerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  inn?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;
}

export class PasswordLoginDto {
  @IsString()
  login: string;

  @IsString()
  password: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ChangePasswordDto {
  /** Текущий пароль — обязателен, если пароль уже был задан */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(6, { message: 'Пароль — минимум 6 символов' })
  @MaxLength(100)
  newPassword: string;
}

export class PushTokenDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

export class AddressDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  isDefault?: boolean;
}
