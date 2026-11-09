import { Global, Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller';
import { AuditService } from './audit.service';
import { ExcelService } from './excel.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from './prisma.service';
import { SettingsService } from './settings.service';
import { StockService } from './stock.service';

@Global()
@Module({
  controllers: [ClientErrorsController],
  providers: [PrismaService, AuditService, NotificationsService, SettingsService, ExcelService, StockService],
  exports: [PrismaService, AuditService, NotificationsService, SettingsService, ExcelService, StockService],
})
export class CommonModule {}
