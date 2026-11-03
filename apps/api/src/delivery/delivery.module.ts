import { Global, Module } from '@nestjs/common';
import { CourierController, TrackingController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { RoutingService } from './routing.service';

@Global()
@Module({
  controllers: [CourierController, TrackingController],
  providers: [DeliveryService, RoutingService],
  exports: [RoutingService],
})
export class DeliveryModule {}
