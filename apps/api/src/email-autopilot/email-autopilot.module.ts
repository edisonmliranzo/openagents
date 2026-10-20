import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { ConnectorsModule } from '../connectors/connectors.module'
import { PrismaModule } from '../prisma/prisma.module'
import { EmailAutopilotController } from './email-autopilot.controller'
import { EmailAutopilotService } from './email-autopilot.service'
import { EmailAutopilotStore } from './email-autopilot.store'

@Module({
  imports: [PrismaModule, AgentModule, ConnectorsModule],
  providers: [EmailAutopilotService, EmailAutopilotStore],
  controllers: [EmailAutopilotController],
  exports: [EmailAutopilotService],
})
export class EmailAutopilotModule {}
