import { Module } from '@nestjs/common'
import { OpenAiCompatController } from './openai-compat.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { AgentModule } from '../agent/agent.module'

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [OpenAiCompatController],
})
export class OpenAiCompatModule {}
