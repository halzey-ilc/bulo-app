import { createHash, randomInt } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SmsService } from './sms.service';

const TTL_MS = 5 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  private hash(phone: string, code: string) {
    return createHash('sha256')
      .update(`${phone}:${code}:${process.env.JWT_SECRET ?? 'dev-secret'}`)
      .digest('hex');
  }

  /** Отправляет код. В режиме разработки (DEV_RETURN_OTP=true) возвращает его, чтобы тестировать без СМС. */
  async send(phone: string, purpose: OtpPurpose): Promise<{ devCode?: string }> {
    const last = await this.prisma.otpCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < RESEND_MS) {
      throw new HttpException('Код уже отправлен, повторите через минуту', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(1000, 10000));
    await this.prisma.otpCode.create({
      data: { phone, purpose, codeHash: this.hash(phone, code), expiresAt: new Date(Date.now() + TTL_MS) },
    });
    await this.sms.send(phone, `BULO: код подтверждения ${code}`);
    return process.env.DEV_RETURN_OTP === 'true' ? { devCode: code } : {};
  }

  /** Проверяет и «гасит» код. Бросает 400 при неверном или просроченном коде. */
  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Код устарел — запросите новый');
    }
    if (otp.codeHash !== this.hash(phone, code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Неверный код');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  }
}
