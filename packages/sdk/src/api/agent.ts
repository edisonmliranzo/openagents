import type { OpenAgentsClient } from '../client'

export interface TestLlmConnectionDto {
  provider: string
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface TestLlmConnectionResult {
  ok: boolean
  model?: string
  warning?: string
  error?: string
}

export interface OllamaModelsResult {
  models: string[]
}

export interface ProviderModelsResult {
  models: string[]
  source: 'live' | 'curated'
  error?: string
}

export function createAgentApi(client: OpenAgentsClient) {
  return {
    testLlmConnection: (dto: TestLlmConnectionDto) =>
      client.post<TestLlmConnectionResult>('/api/v1/agent/test-llm', dto),

    listOllamaModels: (baseUrl?: string) => {
      const qs = baseUrl?.trim() ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}` : ''
      return client.get<OllamaModelsResult>(`/api/v1/agent/ollama-models${qs}`)
    },

    listProviderModels: (provider: string, baseUrl?: string) => {
      const qs = baseUrl?.trim() ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}` : ''
      return client.get<ProviderModelsResult>(`/api/v1/agent/models/${encodeURIComponent(provider)}${qs}`)
    },

    suggestions: (conversationId: string) =>
      client.post<{ suggestions: string[] }>('/api/v1/agent/suggestions', { conversationId }),

    feedback: (messageId: string, vote: 'up' | 'down') =>
      client.post<{ ok: true }>('/api/v1/agent/feedback', { messageId, vote }),
  }
}
