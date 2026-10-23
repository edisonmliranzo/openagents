import { Module, forwardRef } from '@nestjs/common'
import { CronController } from './cron.controller'
import { CronService } from './cron.service'
import { CronSchedulerService } from './cron-scheduler.service'
import { AgentModule } from '../agent/agent.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [forwardRef(() => AgentModule), NotificationsModule],
  controllers: [CronController],
  providers: [CronService, CronSchedulerService],
  exports: [CronService],
})
export class CronModule {}
