import type { OpenAgentsClient } from '../client'
import type { OllamaBenchmarkResult, SystemCostBreakdown, SystemUsageSnapshot } from '@openagents/shared'

export interface SystemCostsQuery {
  start?: string
  end?: string
}

export interface OllamaBenchmarkDto {
  baseUrl?: string
  models?: string[]
  rounds?: number
}

export function createSystemApi(client: OpenAgentsClient) {
  return {
    usage: () => client.get<SystemUsageSnapshot>('/api/v1/system/usage'),

    costs: (query: SystemCostsQuery = {}) => {
      const params = new URLSearchParams()
      if (query.start?.trim()) params.set('start', query.start.trim())
      if (query.end?.trim()) params.set('end', query.end.trim())
      const qs = params.toString()
      return client.get<SystemCostBreakdown>(`/api/v1/system/costs${qs ? `?${qs}` : ''}`)
    },

    benchmarkOllama: (dto: OllamaBenchmarkDto) =>
      client.post<OllamaBenchmarkResult>('/api/v1/system/ollama-benchmark', dto),
  }
}
