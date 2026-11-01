import { Module } from '@nestjs/common';
import { OneCAdminController, OneCController } from './onec.controller';
import { OneCService } from './onec.service';
import { OutboxService } from './outbox.service';

@Module({
  controllers: [OneCController, OneCAdminController],
  providers: [OneCService, OutboxService],
  exports: [OutboxService],
})
export class OneCModule {}
