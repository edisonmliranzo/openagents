import type { OpenAgentsClient } from '../client'

export interface GenerativeComponent {
  id: string
  userId: string
  conversationId: string | null
  name: string
  code: string
  language: 'react' | 'html'
  props: Record<string, unknown>
  state: 'generating' | 'ready' | 'error'
  createdAt: string
  updatedAt: string
}

const BASE = '/api/v1/generative-ui'

export function createGenerativeUiApi(client: OpenAgentsClient) {
  return {
    list: (limit = 50) => client.get<GenerativeComponent[]>(`${BASE}/user?limit=${limit}`),

    listForConversation: (conversationId: string) =>
      client.get<GenerativeComponent[]>(`${BASE}/conversation/${encodeURIComponent(conversationId)}`),

    get: (id: string) => client.get<GenerativeComponent>(`${BASE}/${encodeURIComponent(id)}`),

    create: (input: { name?: string; code: string; language?: 'react' | 'html'; conversationId?: string; props?: Record<string, unknown> }) =>
      client.post<GenerativeComponent>(BASE, input),

    updateProps: (id: string, props: Record<string, unknown>) =>
      client.patch<GenerativeComponent>(`${BASE}/${encodeURIComponent(id)}/props`, { props }),

    remove: (id: string) => client.delete<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
