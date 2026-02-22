import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { NanobotModule } from '../nanobot/nanobot.module'
import { AgentVersionsController } from './agent-versions.controller'
import { AgentVersionsService } from './agent-versions.service'

@Module({
  imports: [UsersModule, NanobotModule],
  controllers: [AgentVersionsController],
  providers: [AgentVersionsService],
  exports: [AgentVersionsService],
})
export class AgentVersionsModule {}
