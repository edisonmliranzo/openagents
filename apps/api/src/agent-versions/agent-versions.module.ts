import { Module } from '@nestjs/common'
import { AgentVersionsController } from './agent-versions.controller'
import { AgentVersionsService } from './agent-versions.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AgentVersionsController],
  providers: [AgentVersionsService],
  exports: [AgentVersionsService],
})
export class AgentVersionsModule {}