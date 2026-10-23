import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { randomUUID } from 'node:crypto'

export interface AbTestVariant {
  id: string
  name: string
  systemPrompt: string
  model?: string
  temperature?: number
}

export interface AbTestResult {
  runs: number
  avgLatencyMs: number
  avgTokens: number
  satisfactionScore: number
}

export interface AbTest {
  id: string
  userId: string
  name: string
  description?: string
  variants: AbTestVariant[]
  winnerVariantId?: string
  status: 'running' | 'paused' | 'completed'
  createdAt: string
  updatedAt: string
  results: Record<string, AbTestResult>
}

const EMPTY_RESULT: AbTestResult = { runs: 0, avgLatencyMs: 0, avgTokens: 0, satisfactionScore: 0 }

@Injectable()
export class AbTestingService {
  private readonly logger = new Logger(AbTestingService.name)

  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    input: { name: string; description?: string; variants: AbTestVariant[] },
  ): Promise<AbTest> {
    const now = new Date().toISOString()
    const variants = (input.variants ?? []).map((v) => ({ ...v, id: v.id ?? randomUUID() }))
    const results: Record<string, AbTestResult> = {}
    for (const variant of variants) {
      results[variant.id] = { ...EMPTY_RESULT }
    }

    const test = await this.prisma.abTest.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        variants: JSON.parse(JSON.stringify(variants)),
        results: JSON.parse(JSON.stringify(results)),
        status: 'running',
      },
    })

    this.logger.log(`Created A/B test "${test.name}" for user ${userId}`)
    return this.toAbTest(test)
  }

  async list(userId: string): Promise<AbTest[]> {
    const tests = await this.prisma.abTest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return tests.map((t) => this.toAbTest(t))
  }

  async get(userId: string, testId: string): Promise<AbTest | null> {
    const test = await this.prisma.abTest.findFirst({ where: { id: testId, userId } })
    return test ? this.toAbTest(test) : null
  }

  async pickVariant(userId: string, testId: string): Promise<AbTestVariant | null> {
    const test = await this.get(userId, testId)
    if (!test || test.variants.length === 0) return null
    // Round-robin: pick the variant with the fewest runs.
    const sorted = [...test.variants].sort(
      (a, b) => (test.results[a.id]?.runs ?? 0) - (test.results[b.id]?.runs ?? 0),
    )
    return sorted[0]
  }

  async recordResult(
    userId: string,
    testId: string,
    variantId: string,
    result: { latencyMs: number; tokens: number; satisfaction?: number },
  ): Promise<void> {
    const test = await this.get(userId, testId)
    if (!test) return
    const current = test.results[variantId]
    if (!current) return

    const runs = current.runs + 1
    const next: AbTestResult = {
      runs,
      avgLatencyMs: (current.avgLatencyMs * current.runs + result.latencyMs) / runs,
      avgTokens: (current.avgTokens * current.runs + result.tokens) / runs,
      satisfactionScore:
        result.satisfaction != null
          ? (current.satisfactionScore * current.runs + result.satisfaction) / runs
          : current.satisfactionScore,
    }

    await this.prisma.abTest.update({
      where: { id: testId },
      data: {
        results: JSON.parse(JSON.stringify({ ...test.results, [variantId]: next })),
      },
    })
  }

  async setWinner(userId: string, testId: string, variantId: string): Promise<AbTest | null> {
    const test = await this.get(userId, testId)
    if (!test) return null
    if (!test.variants.some((v) => v.id === variantId)) return null

    const updated = await this.prisma.abTest.update({
      where: { id: testId },
      data: { winnerVariantId: variantId, status: 'completed' },
    })
    return this.toAbTest(updated)
  }

  async delete(userId: string, testId: string): Promise<boolean> {
    const test = await this.prisma.abTest.findFirst({ where: { id: testId, userId } })
    if (!test) return false
    await this.prisma.abTest.delete({ where: { id: testId } })
    return true
  }

  private toAbTest(test: {
    id: string
    userId: string
    name: string
    description: string | null
    variants: unknown
    results: unknown
    status: string
    winnerVariantId: string | null
    createdAt: Date
    updatedAt: Date
  }): AbTest {
    return {
      id: test.id,
      userId: test.userId,
      name: test.name,
      description: test.description ?? undefined,
      variants: (test.variants as AbTestVariant[]) ?? [],
      winnerVariantId: test.winnerVariantId ?? undefined,
      status: (test.status as AbTest['status']) ?? 'running',
      createdAt: test.createdAt.toISOString(),
      updatedAt: test.updatedAt.toISOString(),
      results: (test.results as Record<string, AbTestResult>) ?? {},
    }
  }
}
