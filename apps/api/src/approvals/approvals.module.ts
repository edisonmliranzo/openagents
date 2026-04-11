import { Module } from '@nestjs/common'
import { ApprovalsService } from './approvals.service'
import { ApprovalsController } from './approvals.controller'
import { ApprovalsInternalController } from './approvals.internal.controller'
import { ToolsModule } from '../tools/tools.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [ToolsModule, NotificationsModule, EventsModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsController, ApprovalsInternalController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
