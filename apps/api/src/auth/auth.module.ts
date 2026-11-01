import { Module } from '@nestjs/common';
import { AddressesController, AuthController, NotificationsController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [AuthController, AddressesController, NotificationsController],
  providers: [AuthService, OtpService, SmsService],
})
export class AuthModule {}
