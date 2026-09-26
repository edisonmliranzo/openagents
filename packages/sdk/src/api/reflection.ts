import type { OpenAgentsClient } from '../client'

export interface ReflectionResult {
  userId: string
  skipped: boolean
  facts: number
  events: number
  reason?: string
}

export function createReflectionApi(client: OpenAgentsClient) {
  return {
    run: () => client.post<ReflectionResult>('/api/v1/reflection/run'),
  }
}
