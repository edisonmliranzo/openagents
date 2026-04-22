import { Injectable, Logger } from '@nestjs/common'

export interface ProactiveTrigger {
  id: string
  userId: string
  source: 'email' | 'slack' | 'github' | 'webhook' | 'system_metric'
  condition: string
  actionAgentId: string
  enabled: boolean
}

@Injectable()
export class ProactiveAgentService {
  private readonly logger = new Logger(ProactiveAgentService.name)
  private triggers = new Map<string, ProactiveTrigger>()

  async registerTrigger(input: Omit<ProactiveTrigger, 'id'>): Promise<ProactiveTrigger> {
    const trigger: ProactiveTrigger = {
      id: `trigger-${Date.now()}`,
      ...input,
    }
    this.triggers.set(trigger.id, trigger)
    this.logger.log(`Registered proactive trigger for source: ${trigger.source}`)
    return trigger
  }

  async handleIncomingEvent(source: ProactiveTrigger['source'], payload: any): Promise<boolean> {
    const activeTriggers = Array.from(this.triggers.values()).filter(t => t.source === source && t.enabled)
    if (activeTriggers.length === 0) return false

    this.logger.log(`Evaluating ${activeTriggers.length} triggers for event from ${source}`)
    // Simulate condition evaluation and agent dispatch
    for (const trigger of activeTriggers) {
      this.logger.log(`Dispatching background agent ${trigger.actionAgentId} due to trigger ${trigger.id}`)
    }
    return true
  }

  async listTriggers(userId: string): Promise<ProactiveTrigger[]> {
    return Array.from(this.triggers.values()).filter(t => t.userId === userId)
  }
}
