import { Module } from '@nestjs/common'
import { SystemModule } from '../system/system.module'
import { CronModule } from '../cron/cron.module'
import { LabsModule } from '../labs/labs.module'
import { WhatsAppModule } from '../channels/whatsapp/whatsapp.module'
import { NanobotModule } from '../nanobot/nanobot.module'
import { RolesGuard } from '../auth/guards/roles.guard'
import { PlatformController } from './platform.controller'
import { PlatformService } from './platform.service'

@Module({
  imports: [SystemModule, CronModule, LabsModule, WhatsAppModule, NanobotModule],
  controllers: [PlatformController],
  providers: [PlatformService, RolesGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
