import { Module } from '@nestjs/common'
import { AnomalyController } from './anomaly.controller'
import { AnomalyService } from './anomaly.service'
import { MetricsModule } from '../metrics/metrics.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule, MetricsModule, NotificationsModule],
  controllers: [AnomalyController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}