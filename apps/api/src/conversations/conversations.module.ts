import { Module } from '@nestjs/common'
import { ConversationsController } from './conversations.controller'
import { ConversationsService } from './conversations.service'
import { AgentModule } from '../agent/agent.module'
import { AuthModule } from '../auth/auth.module'
import { NanobotModule } from '../nanobot/nanobot.module'

@Module({
  imports: [AgentModule, AuthModule, NanobotModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
