import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthGuard } from './common/auth.guard';
import { RolesGuard } from './common/roles.guard';
import { CommonModule } from './common/common.module';
import { DeliveryModule } from './delivery/delivery.module';
import { OneCModule } from './onec/onec.module';
import { OrdersModule } from './orders/orders.module';
import { ProductionModule } from './production/production.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: '30d' },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      // браузер не угадывает тип файла и не исполняет его как страницу
      serveStaticOptions: { setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') },
    }),
    CommonModule,
    DeliveryModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    ProductionModule,
    ReportsModule,
    AdminModule,
    OneCModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
