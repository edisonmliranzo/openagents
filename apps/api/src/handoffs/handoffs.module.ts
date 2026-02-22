import { Global, Module } from '@nestjs/common'
import { MemoryModule } from '../memory/memory.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AuditModule } from '../audit/audit.module'
import { HandoffsController } from './handoffs.controller'
import { HandoffsService } from './handoffs.service'

@Global()
@Module({
  imports: [MemoryModule, NotificationsModule, AuditModule],
  controllers: [HandoffsController],
  providers: [HandoffsService],
  exports: [HandoffsService],
})
export class HandoffsModule {}
