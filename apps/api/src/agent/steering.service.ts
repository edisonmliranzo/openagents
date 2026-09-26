import { Injectable, Logger } from '@nestjs/common'

/**
 * In-memory steering queue: while an agent run is active, the user can send
 * additional instructions that get folded into the running task between tool
 * rounds — the "interrupt & steer" Muse-style interaction.
 */
@Injectable()
export class SteeringService {
  private readonly logger = new Logger(SteeringService.name)
  private readonly queues = new Map<string, string[]>()

  push(conversationId: string, message: string): number {
    const clean = message.trim().slice(0, 2000)
    if (!clean) return this.size(conversationId)
    const queue = this.queues.get(conversationId) ?? []
    queue.push(clean)
    this.queues.set(conversationId, queue)
    this.logger.debug(`Steering queued for ${conversationId} (depth ${queue.length})`)
    return queue.length
  }

  drain(conversationId: string): string[] {
    const queue = this.queues.get(conversationId)
    if (!queue || queue.length === 0) return []
    this.queues.delete(conversationId)
    return queue
  }

  size(conversationId: string): number {
    return this.queues.get(conversationId)?.length ?? 0
  }

  clear(conversationId: string): void {
    this.queues.delete(conversationId)
  }
}
