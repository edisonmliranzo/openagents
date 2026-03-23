import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AgentModule } from '../../agent/agent.module'
import { NanobotModule } from '../../nanobot/nanobot.module'
import { ConnectorsModule } from '../../connectors/connectors.module'
import { ChannelCommandsModule } from '../channel-commands.module'
import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'

@Module({
  imports: [PrismaModule, AgentModule, NanobotModule, ConnectorsModule, ChannelCommandsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
