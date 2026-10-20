import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { PhoneController, PhoneWebhookController } from './phone.controller'
import { PhoneService } from './phone.service'
import { PhoneStore } from './phone.store'

@Module({
  imports: [PrismaModule, AgentModule, NotificationsModule],
  providers: [PhoneService, PhoneStore],
  controllers: [PhoneController, PhoneWebhookController],
  exports: [PhoneService],
})
export class PhoneModule {}
