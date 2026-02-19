export interface SystemHostUsage {
  platform: string
  release: string
  arch: string
  hostname: string
  nodeVersion: string
  uptimeSec: number
}

export interface SystemCpuUsage {
  logicalCores: number
  model: string
  loadAvg1: number
  loadAvg5: number
  loadAvg15: number
  processCpuMs: number
}

export interface SystemMemoryUsage {
  systemTotalBytes: number
  systemFreeBytes: number
  systemUsedBytes: number
  processRssBytes: number
  processHeapUsedBytes: number
  processHeapTotalBytes: number
  processExternalBytes: number
}

export interface SystemDiskUsage {
  path: string
  totalBytes: number
  freeBytes: number
  availableBytes: number
  usedBytes: number
}

export interface SystemUsageSnapshot {
  capturedAt: string
  host: SystemHostUsage
  cpu: SystemCpuUsage
  memory: SystemMemoryUsage
  disk: SystemDiskUsage | null
}

export interface SystemCostTotals {
  runs: number
  llmCalls: number
  inputTokens: number
  outputTokens: number
  toolCalls: number
  estimatedLlmCostUsd: number
  estimatedToolCostUsd: number
  estimatedTotalCostUsd: number
}

export interface SystemCostProviderRow {
  provider: string
  runs: number
  llmCalls: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface SystemCostModelRow {
  provider: string
  model: string
  runs: number
  llmCalls: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  avgCostPerRunUsd: number
}

export interface SystemCostToolRow {
  toolName: string
  calls: number
  successes: number
  failures: number
  estimatedCostUsd: number
}

export interface SystemCostDailyRow {
  date: string
  runs: number
  llmCostUsd: number
  toolCostUsd: number
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  toolCalls: number
}

export interface SystemCostBreakdown {
  generatedAt: string
  rangeStart: string
  rangeEnd: string
  totals: SystemCostTotals
  providers: SystemCostProviderRow[]
  models: SystemCostModelRow[]
  tools: SystemCostToolRow[]
  daily: SystemCostDailyRow[]
}

export interface OllamaBenchmarkPromptResult {
  promptId: string
  latencyMs: number
  score: number
  passed: boolean
  responseSample: string
  error?: string
}

export interface OllamaBenchmarkModelResult {
  model: string
  rounds: number
  avgLatencyMs: number
  p95LatencyMs: number
  avgScore: number
  passRate: number
  errors: number
  prompts: OllamaBenchmarkPromptResult[]
}

export interface OllamaBenchmarkResult {
  generatedAt: string
  baseUrl: string
  models: OllamaBenchmarkModelResult[]
}
