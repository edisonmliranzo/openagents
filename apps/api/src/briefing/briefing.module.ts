import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { GoalsModule } from '../goals/goals.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { BriefingService } from './briefing.service'
import { BriefingController } from './briefing.controller'

@Module({
  imports: [PrismaModule, AgentModule, GoalsModule, NotificationsModule, TelegramModule],
  providers: [BriefingService],
  controllers: [BriefingController],
  exports: [BriefingService],
})
export class BriefingModule {}
