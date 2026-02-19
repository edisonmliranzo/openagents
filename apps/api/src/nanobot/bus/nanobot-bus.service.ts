import { Injectable } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import type { NanobotBusEvent, NanobotBusEventName } from '../types'

type BusHandler = (event: NanobotBusEvent) => void

@Injectable()
export class NanobotBusService {
  private emitter = new EventEmitter()
  private history: NanobotBusEvent[] = []
  private readonly maxHistory = 250

  publish(name: NanobotBusEventName, payload: Record<string, unknown> = {}) {
    const event: NanobotBusEvent = {
      name,
      payload,
      createdAt: new Date().toISOString(),
    }

    this.history.push(event)
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory)
    }

    this.emitter.emit(name, event)
    this.emitter.emit('*', event)
  }

  subscribe(name: NanobotBusEventName | '*', handler: BusHandler) {
    this.emitter.on(name, handler)
    return () => this.emitter.off(name, handler)
  }

  listRecent(limit = 60) {
    const boundedLimit = Math.max(1, Math.min(limit, this.maxHistory))
    return [...this.history].slice(-boundedLimit).reverse()
  }
}
