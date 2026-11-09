import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // имя файла Excel-выгрузки браузер читает из Content-Disposition
    cors: { exposedHeaders: ['Content-Disposition'] },
  });
  // за туннелем/прокси (Cloudflare, nginx) настоящий адрес клиента — в X-Forwarded-For
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
  );
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`BULO API: http://localhost:${port}/api`);
}

bootstrap();
