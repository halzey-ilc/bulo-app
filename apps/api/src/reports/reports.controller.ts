import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../common/decorators';
import { sendFile } from '../common/send-file';
import { ReportsService } from './reports.service';

@Controller('reports')
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  sales(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.sales(from, to);
  }

  @Get('revenue')
  revenue() {
    return this.reports.revenue();
  }

  @Get('debts')
  debts() {
    return this.reports.debts();
  }

  @Get('sales.xlsx')
  async salesXlsx(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    sendFile(res, await this.reports.salesXlsx(from, to));
  }

  @Get('orders.xlsx')
  async ordersXlsx(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    sendFile(res, await this.reports.ordersXlsx(from, to));
  }
}
