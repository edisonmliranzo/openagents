import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AgentModule } from '../../agent/agent.module'
import { NanobotModule } from '../../nanobot/nanobot.module'
import { ConnectorsModule } from '../../connectors/connectors.module'
import { SlackController } from './slack.controller'
import { SlackService } from './slack.service'

@Module({
  imports: [PrismaModule, AgentModule, NanobotModule, ConnectorsModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
