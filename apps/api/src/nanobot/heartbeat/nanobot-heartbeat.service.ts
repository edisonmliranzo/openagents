import { Injectable } from '@nestjs/common'
import { NanobotBusService } from '../bus/nanobot-bus.service'

@Injectable()
export class NanobotHeartbeatService {
  constructor(private bus: NanobotBusService) {}

  tick(userId: string) {
    const payload = {
      userId,
      tickedAt: new Date().toISOString(),
    }
    this.bus.publish('heartbeat.tick', payload)
    return payload
  }
}

