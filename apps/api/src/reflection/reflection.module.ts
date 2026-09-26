import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { MemoryModule } from '../memory/memory.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { ReflectionService } from './reflection.service'
import { ReflectionController } from './reflection.controller'

@Module({
  imports: [PrismaModule, MemoryModule, AgentModule, NotificationsModule, TelegramModule],
  providers: [ReflectionService],
  controllers: [ReflectionController],
  exports: [ReflectionService],
})
export class ReflectionModule {}
