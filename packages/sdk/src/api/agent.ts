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

export function createAgentApi(client: OpenAgentsClient) {
  return {
    testLlmConnection: (dto: TestLlmConnectionDto) =>
      client.post<TestLlmConnectionResult>('/api/v1/agent/test-llm', dto),
  }
}
