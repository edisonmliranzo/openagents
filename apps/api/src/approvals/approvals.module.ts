import { Module } from '@nestjs/common'
import { ApprovalsService } from './approvals.service'
import { ApprovalsController } from './approvals.controller'
import { ToolsModule } from '../tools/tools.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [ToolsModule, NotificationsModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
