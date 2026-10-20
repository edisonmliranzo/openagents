import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { PushService } from './push.service'
import { PushController } from './push.controller'
import { ExpoPushService } from './expo-push.service'
import { ExpoPushController } from './expo-push.controller'

@Module({
  providers: [NotificationsService, PushService, ExpoPushService],
  controllers: [NotificationsController, PushController, ExpoPushController],
  exports: [NotificationsService, PushService, ExpoPushService],
})
export class NotificationsModule {}
