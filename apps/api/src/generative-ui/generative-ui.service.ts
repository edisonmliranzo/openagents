import { Injectable, Logger } from '@nestjs/common'

export interface GenerativeUIComponent {
  id: string
  conversationId: string
  code: string
  language: 'react' | 'html'
  props: Record<string, unknown>
  state: 'generating' | 'ready' | 'error'
  createdAt: string
}

@Injectable()
export class GenerativeUIService {
  private readonly logger = new Logger(GenerativeUIService.name)
  private components = new Map<string, GenerativeUIComponent>()

  async createComponent(input: { conversationId: string; code: string; language: 'react' | 'html' }): Promise<GenerativeUIComponent> {
    const comp: GenerativeUIComponent = {
      id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: input.conversationId,
      code: input.code,
      language: input.language,
      props: {},
      state: 'ready',
      createdAt: new Date().toISOString(),
    }
    this.components.set(comp.id, comp)
    this.logger.log(`Created Generative UI component ${comp.id} for conversation ${input.conversationId}`)
    return comp
  }

  async getComponent(id: string): Promise<GenerativeUIComponent | null> {
    return this.components.get(id) ?? null
  }

  async updateComponentProps(id: string, props: Record<string, unknown>): Promise<GenerativeUIComponent | null> {
    const comp = this.components.get(id)
    if (!comp) return null
    comp.props = { ...comp.props, ...props }
    return comp
  }

  async listForConversation(conversationId: string): Promise<GenerativeUIComponent[]> {
    return Array.from(this.components.values()).filter(c => c.conversationId === conversationId)
  }
}
