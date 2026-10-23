import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { MemoryModule } from '../memory/memory.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { UsersModule } from '../users/users.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { ReflectionService } from './reflection.service'
import { LessonsService } from './lessons.service'
import { LessonsStoreModule } from './lessons-store.module'
import { ReflectionController } from './reflection.controller'

@Module({
  imports: [PrismaModule, MemoryModule, AgentModule, NotificationsModule, TelegramModule, UsersModule, LessonsStoreModule],
  providers: [ReflectionService, LessonsService],
  controllers: [ReflectionController],
  exports: [ReflectionService, LessonsService],
})
export class ReflectionModule {}
