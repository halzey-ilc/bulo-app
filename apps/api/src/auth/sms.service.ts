import { Injectable, Logger } from '@nestjs/common';

/**
 * Отправка СМС. Сейчас — режим console (код пишется в лог сервера).
 * Реальный шлюз (Nikita, SMSPRO и т.п.) подключается в send() по SMS_PROVIDER, когда выберем провайдера.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SMS');

  async send(phone: string, text: string): Promise<void> {
    const provider = process.env.SMS_PROVIDER ?? 'console';
    switch (provider) {
      case 'console':
        this.logger.log(`→ ${phone}: ${text}`);
        return;
      default:
        throw new Error(`СМС-провайдер «${provider}» ещё не подключён`);
    }
  }
}
