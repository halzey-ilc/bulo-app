import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from './auth-user';
import { CurrentUser, Public, Roles } from './decorators';
import { PrismaService } from './prisma.service';

class ClientErrorDto {
  @IsString() @MaxLength(2000) message: string;
  @IsOptional() @IsString() @MaxLength(8000) stack?: string;
  @IsOptional() @IsString() @MaxLength(200) screen?: string;
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @IsOptional() @IsString() @MaxLength(40) version?: string;
  /** fatal — приложение упало, error — перехваченная ошибка */
  @IsOptional() @IsString() @MaxLength(20) level?: string;
}

/**
 * Отчёты о сбоях из мобильного приложения: пишутся в журнал (AuditLog, action = app.error)
 * и в лог сервера. Без внешних сервисов — видно в веб-панели «Журнал» и по GET /api/client-errors.
 */
@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('AppCrash');
  /** Не даём одному телефону засыпать журнал: не больше 30 отчётов в минуту на сервер. */
  private window = { start: Date.now(), count: 0 };

  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Public()
  async report(@Body() dto: ClientErrorDto, @CurrentUser() user?: AuthUser) {
    const now = Date.now();
    if (now - this.window.start > 60_000) this.window = { start: now, count: 0 };
    if (++this.window.count > 30) return { ok: true, dropped: true };
    this.logger.warn(`${dto.level ?? 'error'} ${dto.platform ?? ''} ${dto.version ?? ''} ${dto.screen ?? ''}: ${dto.message}`);
    await this.prisma.auditLog.create({
      data: {
        userId: user?.id ?? null,
        action: 'app.error',
        entity: 'App',
        entityId: dto.screen?.slice(0, 120) ?? null,
        data: { ...dto, role: user?.role ?? null },
      },
    });
    return { ok: true };
  }

  @Get()
  @Roles('ADMIN')
  list(@Query('limit') limit?: string) {
    return this.prisma.auditLog.findMany({
      where: { action: 'app.error' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
      include: { user: { select: { name: true, role: true, phone: true } } },
    });
  }
}
