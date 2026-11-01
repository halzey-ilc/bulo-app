import { Module } from '@nestjs/common';
import { OneCModule } from '../onec/onec.module';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesController, ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [OrdersModule, OneCModule],
  controllers: [ProductionController, InvoicesController],
  providers: [ProductionService],
})
export class ProductionModule {}
