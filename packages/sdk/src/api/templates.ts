import type { OpenAgentsClient } from '../client'

export interface ConversationTemplate {
  id: string
  userId: string | null
  name: string
  description: string
  category: string
  systemPrompt?: string
  starterMessages: string[]
  tools: string[]
  personality?: string
  tags: string[]
  isPublic: boolean
  useCount: number
  createdAt: string
}

export interface CreateTemplateInput {
  name: string
  description: string
  category: string
  systemPrompt?: string
  starterMessages?: string[]
  tools?: string[]
  personality?: string
  tags?: string[]
  isPublic?: boolean
}

const BASE = '/api/v1/templates'

export function createTemplatesApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<ConversationTemplate[]>(BASE),

    categories: () => client.get<string[]>(`${BASE}/categories`),

    get: (id: string) => client.get<ConversationTemplate>(`${BASE}/${encodeURIComponent(id)}`),

    create: (input: CreateTemplateInput) => client.post<ConversationTemplate>(BASE, input),

    /** Records that a template was used — bumps its usage counter. */
    use: (id: string) => client.post<{ ok: boolean }>(`${BASE}/${encodeURIComponent(id)}/use`),

    remove: (id: string) => client.delete<boolean>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
