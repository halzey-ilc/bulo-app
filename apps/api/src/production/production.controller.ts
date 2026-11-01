import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsString } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { sendFile } from '../common/send-file';
import { ProductionService } from './production.service';

class CreateSheetDto {
  @IsString()
  date: string;
}

/** Сводные накладные для цеха. */
@Controller('production')
@Roles('ADMIN', 'MANAGER', 'WORKSHOP', 'ACCOUNTANT')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('summary')
  summary(@Query('date') date: string) {
    return this.production.summary(date);
  }

  @Post('sheets')
  @Roles('ADMIN', 'MANAGER', 'WORKSHOP')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSheetDto) {
    return this.production.createSheet(user, dto.date);
  }

  @Get('sheets')
  sheets(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.production.sheets(dateFrom, dateTo);
  }

  @Get('sheets/:id')
  sheet(@Param('id') id: string) {
    return this.production.sheet(id);
  }

  @Get('sheets/:id/xlsx')
  async sheetXlsx(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.production.sheetXlsx(id));
  }
}

/** Накладные на отгрузку по контрагентам. */
@Controller('invoices')
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT', 'COURIER')
export class InvoicesController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  list(@Query('date') date: string) {
    return this.production.invoices(date);
  }

  @Get('xlsx')
  async xlsx(@Query('date') date: string, @Res() res: Response) {
    sendFile(res, await this.production.invoicesXlsx(date));
  }
}
