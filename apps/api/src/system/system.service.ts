import { Injectable } from '@nestjs/common'
import { statfsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  OllamaBenchmarkModelResult,
  OllamaBenchmarkPromptResult,
  OllamaBenchmarkResult,
  SystemCostBreakdown,
  SystemCostDailyRow,
  SystemCostModelRow,
  SystemCostProviderRow,
  SystemCostToolRow,
  SystemCostTotals,
  SystemDiskUsage,
  SystemUsageSnapshot,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'

interface ModelRate {
  inputUsdPer1k: number
  outputUsdPer1k: number
}

interface RunMetadataShape {
  provider?: string
  model?: string | null
  llmCalls?: number
  inputTokens?: number
  outputTokens?: number
}

interface BenchmarkPromptDef {
  id: string
  prompt: string
  maxTokens: number
}

const PROVIDER_DEFAULT_RATES: Record<string, ModelRate> = {
  anthropic: { inputUsdPer1k: 0.003, outputUsdPer1k: 0.015 },
  openai: { inputUsdPer1k: 0.005, outputUsdPer1k: 0.015 },
  ollama: { inputUsdPer1k: 0, outputUsdPer1k: 0 },
}
const ZERO_RATE: ModelRate = { inputUsdPer1k: 0, outputUsdPer1k: 0 }

const MODEL_RATES: Record<string, { provider: string; rate: ModelRate }> = {
  'claude-sonnet-4-6': { provider: 'anthropic', rate: { inputUsdPer1k: 0.003, outputUsdPer1k: 0.015 } },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', rate: { inputUsdPer1k: 0.0008, outputUsdPer1k: 0.004 } },
  'claude-opus-4-6': { provider: 'anthropic', rate: { inputUsdPer1k: 0.015, outputUsdPer1k: 0.075 } },
  'gpt-4o': { provider: 'openai', rate: { inputUsdPer1k: 0.005, outputUsdPer1k: 0.015 } },
  'gpt-4o-mini': { provider: 'openai', rate: { inputUsdPer1k: 0.00015, outputUsdPer1k: 0.0006 } },
  'gpt-4-turbo': { provider: 'openai', rate: { inputUsdPer1k: 0.01, outputUsdPer1k: 0.03 } },
}

const TOOL_FLAT_COST_USD: Record<string, number> = {
  web_search: 0.002,
}

const BENCHMARK_PROMPTS: BenchmarkPromptDef[] = [
  {
    id: 'json_struct',
    prompt: 'Return only valid minified JSON: {"city":"Paris","country":"France"}',
    maxTokens: 120,
  },
  {
    id: 'math_23x19',
    prompt: 'What is 23 * 19? Reply with only the integer.',
    maxTokens: 30,
  },
  {
    id: 'unit_test_reasoning',
    prompt: 'In one concise sentence, explain why unit tests make refactoring safer.',
    maxTokens: 120,
  },
]

@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private llm: LLMService,
  ) {}

  usage(): SystemUsageSnapshot {
    const memory = process.memoryUsage()
    const cpuInfo = os.cpus()
    const uptimeSec = Math.floor(process.uptime())
    const processCpu = process.cpuUsage()
    const processCpuMs = Math.round((processCpu.user + processCpu.system) / 1000)

    const systemTotalBytes = os.totalmem()
    const systemFreeBytes = os.freemem()
    const systemUsedBytes = Math.max(0, systemTotalBytes - systemFreeBytes)

    return {
      capturedAt: new Date().toISOString(),
      host: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        uptimeSec,
      },
      cpu: {
        logicalCores: cpuInfo.length,
        model: cpuInfo[0]?.model ?? 'unknown',
        loadAvg1: os.loadavg()[0] ?? 0,
        loadAvg5: os.loadavg()[1] ?? 0,
        loadAvg15: os.loadavg()[2] ?? 0,
        processCpuMs,
      },
      memory: {
        systemTotalBytes,
        systemFreeBytes,
        systemUsedBytes,
        processRssBytes: memory.rss,
        processHeapUsedBytes: memory.heapUsed,
        processHeapTotalBytes: memory.heapTotal,
        processExternalBytes: memory.external,
      },
      disk: this.getDiskUsage(),
    }
  }

  async costs(userId: string, start?: string, end?: string): Promise<SystemCostBreakdown> {
    const { startDate, endDate } = this.resolveRange(start, end)
    const [runs, toolMessages] = await Promise.all([
      this.prisma.agentRun.findMany({
        where: {
          conversation: { userId },
          startedAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          startedAt: true,
          metadata: true,
        },
      }),
      this.prisma.message.findMany({
        where: {
          role: 'tool',
          conversation: { userId },
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          status: true,
          createdAt: true,
          toolCallJson: true,
        },
      }),
    ])

    const totals: SystemCostTotals = {
      runs: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      estimatedLlmCostUsd: 0,
      estimatedToolCostUsd: 0,
      estimatedTotalCostUsd: 0,
    }

    const providerMap = new Map<string, SystemCostProviderRow>()
    const modelMap = new Map<string, SystemCostModelRow>()
    const toolMap = new Map<string, SystemCostToolRow>()
    const dailyMap = new Map<string, SystemCostDailyRow>()

    for (const run of runs) {
      const date = run.startedAt.toISOString().slice(0, 10)
      const daily = this.ensureDaily(dailyMap, date)
      daily.runs += 1
      totals.runs += 1

      const metadata = this.parseRunMetadata(run.metadata)
      if (!metadata) continue

      const provider = metadata.provider?.trim() || 'unknown'
      const model = metadata.model?.trim() || 'unknown'
      const llmCalls = this.toNonNegativeInt(metadata.llmCalls)
      const inputTokens = this.toNonNegativeInt(metadata.inputTokens)
      const outputTokens = this.toNonNegativeInt(metadata.outputTokens)
      const llmCost = this.estimateLlmCostUsd(provider, model, inputTokens, outputTokens)

      totals.llmCalls += llmCalls
      totals.inputTokens += inputTokens
      totals.outputTokens += outputTokens
      totals.estimatedLlmCostUsd += llmCost

      daily.inputTokens += inputTokens
      daily.outputTokens += outputTokens
      daily.llmCostUsd += llmCost
      daily.totalCostUsd += llmCost

      const providerRow = this.ensureProvider(providerMap, provider)
      providerRow.runs += 1
      providerRow.llmCalls += llmCalls
      providerRow.inputTokens += inputTokens
      providerRow.outputTokens += outputTokens
      providerRow.estimatedCostUsd += llmCost

      const modelKey = `${provider}::${model}`
      const modelRow = this.ensureModel(modelMap, provider, modelKey, model)
      modelRow.runs += 1
      modelRow.llmCalls += llmCalls
      modelRow.inputTokens += inputTokens
      modelRow.outputTokens += outputTokens
      modelRow.estimatedCostUsd += llmCost
    }

    for (const toolMessage of toolMessages) {
      const toolName = this.parseToolName(toolMessage.toolCallJson) ?? 'unknown'
      const toolCost = TOOL_FLAT_COST_USD[toolName] ?? 0
      const date = toolMessage.createdAt.toISOString().slice(0, 10)
      const daily = this.ensureDaily(dailyMap, date)
      const toolRow = this.ensureTool(toolMap, toolName)

      toolRow.calls += 1
      toolRow.estimatedCostUsd += toolCost
      totals.toolCalls += 1
      totals.estimatedToolCostUsd += toolCost
      daily.toolCalls += 1
      daily.toolCostUsd += toolCost
      daily.totalCostUsd += toolCost

      if (toolMessage.status === 'done') toolRow.successes += 1
      if (toolMessage.status === 'error') toolRow.failures += 1
    }

    totals.estimatedTotalCostUsd = totals.estimatedLlmCostUsd + totals.estimatedToolCostUsd

    for (const row of modelMap.values()) {
      row.avgCostPerRunUsd = row.runs > 0 ? row.estimatedCostUsd / row.runs : 0
    }

    const providers = [...providerMap.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    const models = [...modelMap.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    const tools = [...toolMap.values()].sort((a, b) => b.calls - a.calls)
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    return {
      generatedAt: new Date().toISOString(),
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      totals: this.roundTotals(totals),
      providers: providers.map((row) => this.roundProvider(row)),
      models: models.map((row) => this.roundModel(row)),
      tools: tools.map((row) => this.roundTool(row)),
      daily: daily.map((row) => this.roundDaily(row)),
    }
  }

  async benchmarkOllama(baseUrl?: string, models?: string[], rounds = 1): Promise<OllamaBenchmarkResult> {
    const resolvedBaseUrl = (baseUrl ?? 'http://localhost:11434').trim()
    const allModels = models?.map((value) => value.trim()).filter(Boolean) ?? []
    const sourceModels = allModels.length > 0 ? allModels : await this.llm.listOllamaModels(resolvedBaseUrl)
    const uniqueModels = [...new Set(sourceModels)].slice(0, 8)
    const safeRounds = Math.max(1, Math.min(Number(rounds) || 1, 3))

    const results: OllamaBenchmarkModelResult[] = []
    for (const model of uniqueModels) {
      const promptResults: OllamaBenchmarkPromptResult[] = []
      const allLatencies: number[] = []
      const allScores: number[] = []
      let passCount = 0
      let errorCount = 0
      let attemptCount = 0

      for (const promptDef of BENCHMARK_PROMPTS) {
        const promptLatencies: number[] = []
        const promptScores: number[] = []
        let promptPassCount = 0
        let sample = ''
        let lastError = ''

        for (let round = 0; round < safeRounds; round += 1) {
          attemptCount += 1
          const startedAt = Date.now()
          try {
            const completion = await this.llm.runOllamaPrompt(
              resolvedBaseUrl,
              model,
              promptDef.prompt,
              promptDef.maxTokens,
            )
            const latencyMs = Date.now() - startedAt
            const evaluation = this.scoreBenchmarkResponse(promptDef.id, completion.content)
            promptLatencies.push(latencyMs)
            promptScores.push(evaluation.score)
            sample = completion.content.slice(0, 160)
            if (evaluation.passed) {
              promptPassCount += 1
              passCount += 1
            }

            allLatencies.push(latencyMs)
            allScores.push(evaluation.score)
          } catch (error: any) {
            errorCount += 1
            lastError = error?.message ?? 'Benchmark call failed'
          }
        }

        const avgLatencyMs = promptLatencies.length > 0
          ? promptLatencies.reduce((sum, value) => sum + value, 0) / promptLatencies.length
          : 0
        const avgScore = promptScores.length > 0
          ? promptScores.reduce((sum, value) => sum + value, 0) / promptScores.length
          : 0
        const passed = promptPassCount > 0 && promptPassCount >= Math.ceil(safeRounds / 2)

        promptResults.push({
          promptId: promptDef.id,
          latencyMs: this.roundNumber(avgLatencyMs),
          score: this.roundNumber(avgScore),
          passed,
          responseSample: sample,
          ...(lastError && promptLatencies.length === 0 ? { error: lastError } : {}),
        })
      }

      const avgLatencyMs = allLatencies.length > 0
        ? allLatencies.reduce((sum, value) => sum + value, 0) / allLatencies.length
        : 0
      const avgScore = allScores.length > 0
        ? allScores.reduce((sum, value) => sum + value, 0) / allScores.length
        : 0
      const passRate = attemptCount > 0 ? passCount / attemptCount : 0

      results.push({
        model,
        rounds: safeRounds,
        avgLatencyMs: this.roundNumber(avgLatencyMs),
        p95LatencyMs: this.roundNumber(this.percentile95(allLatencies)),
        avgScore: this.roundNumber(avgScore),
        passRate: this.roundNumber(passRate),
        errors: errorCount,
        prompts: promptResults,
      })
    }

    return {
      generatedAt: new Date().toISOString(),
      baseUrl: resolvedBaseUrl,
      models: results.sort((a, b) => b.avgScore - a.avgScore || a.avgLatencyMs - b.avgLatencyMs),
    }
  }

  private getDiskUsage(): SystemDiskUsage | null {
    try {
      const root = path.parse(process.cwd()).root || '/'
      const stats = statfsSync(root)
      const blockSize = Number(stats.bsize)
      const totalBytes = Number(stats.blocks) * blockSize
      const freeBytes = Number(stats.bfree) * blockSize
      const availableBytes = Number(stats.bavail) * blockSize
      const usedBytes = Math.max(0, totalBytes - freeBytes)

      if (
        !Number.isFinite(totalBytes) ||
        !Number.isFinite(freeBytes) ||
        !Number.isFinite(availableBytes) ||
        totalBytes <= 0
      ) {
        return null
      }

      return {
        path: root,
        totalBytes: Math.floor(totalBytes),
        freeBytes: Math.floor(freeBytes),
        availableBytes: Math.floor(availableBytes),
        usedBytes: Math.floor(usedBytes),
      }
    } catch {
      return null
    }
  }

  private resolveRange(start?: string, end?: string) {
    const endDate = end ? new Date(end) : new Date()
    const fallbackEnd = Number.isFinite(endDate.getTime()) ? endDate : new Date()
    const startDate = start ? new Date(start) : new Date(fallbackEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fallbackStart = Number.isFinite(startDate.getTime())
      ? startDate
      : new Date(fallbackEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    if (fallbackStart.getTime() > fallbackEnd.getTime()) {
      return {
        startDate: fallbackEnd,
        endDate: fallbackStart,
      }
    }
    return {
      startDate: fallbackStart,
      endDate: fallbackEnd,
    }
  }

  private parseRunMetadata(raw: string | null): RunMetadataShape | null {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as RunMetadataShape
      if (!parsed || typeof parsed !== 'object') return null
      return parsed
    } catch {
      return null
    }
  }

  private parseToolName(raw: string | null) {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { name?: unknown }
      return typeof parsed?.name === 'string' ? parsed.name.trim() : null
    } catch {
      return null
    }
  }

  private ensureProvider(map: Map<string, SystemCostProviderRow>, provider: string) {
    const existing = map.get(provider)
    if (existing) return existing
    const created: SystemCostProviderRow = {
      provider,
      runs: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    }
    map.set(provider, created)
    return created
  }

  private ensureModel(map: Map<string, SystemCostModelRow>, provider: string, key: string, model: string) {
    const existing = map.get(key)
    if (existing) return existing
    const created: SystemCostModelRow = {
      provider,
      model,
      runs: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      avgCostPerRunUsd: 0,
    }
    map.set(key, created)
    return created
  }

  private ensureTool(map: Map<string, SystemCostToolRow>, toolName: string) {
    const existing = map.get(toolName)
    if (existing) return existing
    const created: SystemCostToolRow = {
      toolName,
      calls: 0,
      successes: 0,
      failures: 0,
      estimatedCostUsd: 0,
    }
    map.set(toolName, created)
    return created
  }

  private ensureDaily(map: Map<string, SystemCostDailyRow>, date: string) {
    const existing = map.get(date)
    if (existing) return existing
    const created: SystemCostDailyRow = {
      date,
      runs: 0,
      llmCostUsd: 0,
      toolCostUsd: 0,
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
    }
    map.set(date, created)
    return created
  }

  private estimateLlmCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number) {
    const modelRate = MODEL_RATES[model]?.rate
    const providerRate = PROVIDER_DEFAULT_RATES[provider] ?? ZERO_RATE
    const rate = modelRate ?? providerRate
    return (inputTokens / 1000) * rate.inputUsdPer1k + (outputTokens / 1000) * rate.outputUsdPer1k
  }

  private toNonNegativeInt(value: unknown) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, Math.floor(parsed))
  }

  private roundNumber(value: number) {
    return Math.round(value * 10000) / 10000
  }

  private roundTotals(value: SystemCostTotals): SystemCostTotals {
    return {
      ...value,
      estimatedLlmCostUsd: this.roundNumber(value.estimatedLlmCostUsd),
      estimatedToolCostUsd: this.roundNumber(value.estimatedToolCostUsd),
      estimatedTotalCostUsd: this.roundNumber(value.estimatedTotalCostUsd),
    }
  }

  private roundProvider(value: SystemCostProviderRow): SystemCostProviderRow {
    return { ...value, estimatedCostUsd: this.roundNumber(value.estimatedCostUsd) }
  }

  private roundModel(value: SystemCostModelRow): SystemCostModelRow {
    return {
      ...value,
      estimatedCostUsd: this.roundNumber(value.estimatedCostUsd),
      avgCostPerRunUsd: this.roundNumber(value.avgCostPerRunUsd),
    }
  }

  private roundTool(value: SystemCostToolRow): SystemCostToolRow {
    return { ...value, estimatedCostUsd: this.roundNumber(value.estimatedCostUsd) }
  }

  private roundDaily(value: SystemCostDailyRow): SystemCostDailyRow {
    return {
      ...value,
      llmCostUsd: this.roundNumber(value.llmCostUsd),
      toolCostUsd: this.roundNumber(value.toolCostUsd),
      totalCostUsd: this.roundNumber(value.totalCostUsd),
    }
  }

  private percentile95(values: number[]) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))
    return sorted[idx]
  }

  private scoreBenchmarkResponse(promptId: string, response: string) {
    const text = response.trim()
    if (!text) return { score: 0, passed: false }

    if (promptId === 'math_23x19') {
      const passed = /^437\b/.test(text)
      return { score: passed ? 100 : 0, passed }
    }

    if (promptId === 'json_struct') {
      try {
        const parsed = JSON.parse(text) as { city?: string; country?: string }
        const cityOk = (parsed.city ?? '').toLowerCase() === 'paris'
        const countryOk = (parsed.country ?? '').toLowerCase() === 'france'
        const passed = cityOk && countryOk
        return { score: passed ? 100 : 50, passed }
      } catch {
        return { score: 0, passed: false }
      }
    }

    const lower = text.toLowerCase()
    const hasTest = lower.includes('test')
    const hasSafety = lower.includes('refactor') || lower.includes('regress') || lower.includes('confidence')
    if (hasTest && hasSafety) return { score: 100, passed: true }
    if (hasTest) return { score: 60, passed: false }
    return { score: 20, passed: false }
  }
}
