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
  error?: string
}

export interface OllamaModelsResult {
  models: string[]
}

export function createAgentApi(client: OpenAgentsClient) {
  return {
    testLlmConnection: (dto: TestLlmConnectionDto) =>
      client.post<TestLlmConnectionResult>('/api/v1/agent/test-llm', dto),

    listOllamaModels: (baseUrl?: string) => {
      const qs = baseUrl?.trim() ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}` : ''
      return client.get<OllamaModelsResult>(`/api/v1/agent/ollama-models${qs}`)
    },
  }
}
