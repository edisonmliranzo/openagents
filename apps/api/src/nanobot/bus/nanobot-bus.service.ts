import { Injectable } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import type { NanobotBusEvent, NanobotBusEventName } from '../types'

type BusHandler = (event: NanobotBusEvent) => void

@Injectable()
export class NanobotBusService {
  private emitter = new EventEmitter()

  publish(name: NanobotBusEventName, payload: Record<string, unknown> = {}) {
    const event: NanobotBusEvent = {
      name,
      payload,
      createdAt: new Date().toISOString(),
    }
    this.emitter.emit(name, event)
    this.emitter.emit('*', event)
  }

  subscribe(name: NanobotBusEventName | '*', handler: BusHandler) {
    this.emitter.on(name, handler)
    return () => this.emitter.off(name, handler)
  }
}

