import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OneCDocStatus, OneCDocType } from '@prisma/client';
import type { Response } from 'express';
import { Public, Roles } from '../common/decorators';
import { sendFile } from '../common/send-file';
import { AckDto, CounterpartiesDto, NomenclatureDto, PricesImportDto, PriceTypesDto } from './onec.dto';
import { OneCService } from './onec.service';

/** 1С авторизуется ключом в заголовке X-Api-Key. */
@Injectable()
class OneCKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ONEC_API_KEY;
    const given = ctx.switchToHttp().getRequest().headers['x-api-key'];
    if (
      !expected ||
      typeof given !== 'string' ||
      given.length !== expected.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Неверный ключ обмена 1С');
    }
    return true;
  }
}

/** Точки обмена, которые вызывает 1С. */
@Controller('onec')
@Public()
@UseGuards(OneCKeyGuard)
export class OneCController {
  constructor(private readonly onec: OneCService) {}

  @Post('import/nomenclature')
  nomenclature(@Body() dto: NomenclatureDto) {
    return this.onec.importNomenclature(dto);
  }

  @Post('import/price-types')
  priceTypes(@Body() dto: PriceTypesDto) {
    return this.onec.importPriceTypes(dto);
  }

  @Post('import/prices')
  prices(@Body() dto: PricesImportDto) {
    return this.onec.importPrices(dto);
  }

  @Post('import/counterparties')
  counterparties(@Body() dto: CounterpartiesDto) {
    return this.onec.importCounterparties(dto);
  }

  @Get('outbox')
  outbox(@Query('limit') limit?: string) {
    return this.onec.outbox(limit ? Number(limit) : undefined);
  }

  @Post('outbox/:id/ack')
  ack(@Param('id') id: string, @Body() dto: AckDto) {
    return this.onec.ack(id, dto.ok, dto.number, dto.error);
  }
}

/** Экран «1С» в веб-панели: очередь, журнал, ручная выгрузка. */
@Controller('admin/onec')
@Roles('ADMIN', 'ACCOUNTANT')
export class OneCAdminController {
  constructor(private readonly onec: OneCService) {}

  @Get('status')
  status() {
    return this.onec.status();
  }

  @Get('documents')
  documents(@Query('status') status?: OneCDocStatus, @Query('type') type?: OneCDocType) {
    return this.onec.documents(status, type);
  }

  @Post('documents/:id/retry')
  retry(@Param('id') id: string) {
    return this.onec.retry(id);
  }

  @Get('log')
  log() {
    return this.onec.syncLog();
  }

  @Get('counterparties')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  counterparties(@Query('search') search?: string) {
    return this.onec.counterparties(search);
  }

  @Get('export.xlsx')
  async export(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: OneCDocType,
    @Query('onlyPending') onlyPending?: string,
    @Query('markSent') markSent?: string,
  ) {
    sendFile(
      res,
      await this.onec.exportXlsx({
        from,
        to,
        type,
        onlyPending: onlyPending === 'true',
        markSent: markSent === 'true',
      }),
    );
  }
}
