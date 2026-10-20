import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { ConnectorsModule } from '../connectors/connectors.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { ProactiveAgentService } from './proactive-agents.service'
import { ProactiveAgentsController } from './proactive-agents.controller'
import { ProactiveWebhookController } from './proactive-webhook.controller'
import { MomentsService } from './moments.service'
import { MomentsStore } from './moments.store'

@Module({
  imports: [PrismaModule, AgentModule, ConnectorsModule, NotificationsModule, TelegramModule],
  providers: [ProactiveAgentService, MomentsService, MomentsStore],
  controllers: [ProactiveAgentsController, ProactiveWebhookController],
  exports: [ProactiveAgentService, MomentsService],
})
export class ProactiveAgentsModule {}
