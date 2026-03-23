import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AgentModule } from '../../agent/agent.module'
import { NanobotModule } from '../../nanobot/nanobot.module'
import { ConnectorsModule } from '../../connectors/connectors.module'
import { ChannelCommandsModule } from '../channel-commands.module'
import { DiscordController } from './discord.controller'
import { DiscordService } from './discord.service'

@Module({
  imports: [PrismaModule, AgentModule, NanobotModule, ConnectorsModule, ChannelCommandsModule],
  controllers: [DiscordController],
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}
