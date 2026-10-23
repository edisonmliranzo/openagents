import { Module } from '@nestjs/common'
import { AgentVersionsController } from './agent-versions.controller'
import { AgentVersionsService } from './agent-versions.service'
import { PrismaModule } from '../prisma/prisma.module'
import { NanobotModule } from '../nanobot/nanobot.module'

@Module({
  imports: [PrismaModule, NanobotModule],
  controllers: [AgentVersionsController],
  providers: [AgentVersionsService],
  exports: [AgentVersionsService],
})
export class AgentVersionsModule {}
