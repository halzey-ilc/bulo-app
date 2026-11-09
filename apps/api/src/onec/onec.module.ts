import { Module } from '@nestjs/common';
import { OneCPushService } from './onec-push.service';
import { OneCAdminController, OneCController } from './onec.controller';
import { OneCService } from './onec.service';
import { OutboxService } from './outbox.service';

@Module({
  controllers: [OneCController, OneCAdminController],
  providers: [OneCService, OutboxService, OneCPushService],
  exports: [OutboxService],
})
export class OneCModule {}
