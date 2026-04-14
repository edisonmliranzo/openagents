export interface A2AConfig {
  agentId: string
  endpoint?: string
  authToken?: string
}

export interface A2AMessage {
  id: string
  senderId: string
  receiverId: string
  type: 'request' | 'response' | 'event'
  action: string
  payload: Record<string, unknown>
  timestamp: string
}

export interface A2AResult {
  success: boolean
  messages?: A2AMessage[]
  error?: string
}

export class A2AClient {
  private config: A2AConfig
  private messageHandlers: Map<string, (msg: A2AMessage) => void> = new Map()

  constructor(config: A2AConfig) {
    this.config = config
  }

  async send(message: Omit<A2AMessage, 'id' | 'timestamp'>): Promise<A2AResult> {
    try {
      const fullMessage: A2AMessage = {
        ...message,
        id: this.generateId(),
        senderId: this.config.agentId,
        timestamp: new Date().toISOString(),
      }

      if (this.config.endpoint) {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.authToken}`,
          },
          body: JSON.stringify(fullMessage),
        })

        if (!response.ok) {
          const error = await response.text()
          return { success: false, error }
        }

        const data = (await response.json()) as A2AMessage[]
        return { success: true, messages: data }
      }

      return { success: true, messages: [fullMessage] }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
      }
    }
  }

  async request(
    targetAgentId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<A2AResult> {
    return this.send({
      senderId: this.config.agentId,
      receiverId: targetAgentId,
      type: 'request',
      action,
      payload,
    })
  }

  async respond(
    toMessageId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<A2AResult> {
    return this.send({
      senderId: this.config.agentId,
      receiverId: '',
      type: 'response',
      action,
      payload: { ...payload, inReplyTo: toMessageId },
    })
  }

  async broadcast(action: string, payload: Record<string, unknown>): Promise<A2AResult> {
    return this.send({
      senderId: this.config.agentId,
      receiverId: '*',
      type: 'event',
      action,
      payload,
    })
  }

  onMessage(action: string, handler: (msg: A2AMessage) => void): void {
    this.messageHandlers.set(action, handler)
  }

  handleIncoming(message: A2AMessage): void {
    const handler = this.messageHandlers.get(message.action)
    if (handler) {
      handler(message)
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

export interface AgentCard {
  agentId: string
  name: string
  description: string
  capabilities: string[]
  endpoint: string
}

export class A2ARegistry {
  private agents: Map<string, AgentCard> = new Map()

  register(card: AgentCard): void {
    this.agents.set(card.agentId, card)
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId)
  }

  get(agentId: string): AgentCard | undefined {
    return this.agents.get(agentId)
  }

  list(): AgentCard[] {
    return Array.from(this.agents.values())
  }
}

export function createA2AClient(config: A2AConfig): A2AClient {
  return new A2AClient(config)
}
