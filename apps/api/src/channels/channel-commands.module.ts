import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { MemoryModule } from '../memory/memory.module'
import { ChannelCommandsService } from './channel-commands.service'

@Module({
  imports: [AgentModule, MemoryModule],
  providers: [ChannelCommandsService],
  exports: [ChannelCommandsService],
})
export class ChannelCommandsModule {}
