import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ExcelService } from './excel.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from './prisma.service';
import { SettingsService } from './settings.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, NotificationsService, SettingsService, ExcelService],
  exports: [PrismaService, AuditService, NotificationsService, SettingsService, ExcelService],
})
export class CommonModule {}
