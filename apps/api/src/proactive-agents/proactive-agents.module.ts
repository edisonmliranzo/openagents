import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { ProactiveAgentService } from './proactive-agents.service'
import { ProactiveAgentsController } from './proactive-agents.controller'
import { ProactiveWebhookController } from './proactive-webhook.controller'

@Module({
  imports: [PrismaModule, AgentModule, NotificationsModule, TelegramModule],
  providers: [ProactiveAgentService],
  controllers: [ProactiveAgentsController, ProactiveWebhookController],
  exports: [ProactiveAgentService],
})
export class ProactiveAgentsModule {}
