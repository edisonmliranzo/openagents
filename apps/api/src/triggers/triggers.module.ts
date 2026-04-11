import { Module } from '@nestjs/common'
import { TriggersController } from './triggers.controller'
import { TriggersService } from './triggers.service'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TriggersController],
  providers: [TriggersService],
  exports: [TriggersService],
})
export class TriggersModule {}
