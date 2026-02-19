import { Injectable } from '@nestjs/common'
import { MemoryService } from '../../memory/memory.service'

@Injectable()
export class NanobotMemoryStore {
  constructor(private memory: MemoryService) {}

  async getUserContext(userId: string) {
    const memories = await this.memory.getForUser(userId)
    return memories.map((m) => `[${m.type}] ${m.content}`)
  }

  async rememberTurn(userId: string, userMessage: string, assistantMessage: string) {
    if (!assistantMessage.trim()) return
    await this.memory.extractAndStore(userId, userMessage, assistantMessage)
  }
}

