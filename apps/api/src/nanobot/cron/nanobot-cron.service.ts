import { Injectable } from '@nestjs/common'
import { NanobotBusService } from '../bus/nanobot-bus.service'

@Injectable()
export class NanobotCronService {
  constructor(private bus: NanobotBusService) {}

  triggerNow(jobName: string, userId: string) {
    const payload = {
      jobName,
      userId,
      source: 'manual',
      triggeredAt: new Date().toISOString(),
    }
    this.bus.publish('cron.triggered', payload)
    return payload
  }
}
