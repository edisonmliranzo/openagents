import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AgentModule } from '../../agent/agent.module'
import { NanobotModule } from '../../nanobot/nanobot.module'
import { WhatsAppController } from './whatsapp.controller'
import { WhatsAppService } from './whatsapp.service'

@Module({
  imports: [PrismaModule, AgentModule, NanobotModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}

