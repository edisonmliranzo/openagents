import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { randomUUID } from 'node:crypto'

export interface AbTestVariant {
  id: string
  name: string
  systemPrompt: string
  model?: string
  temperature?: number
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
  results: Record<string, { runs: number; avgLatencyMs: number; avgTokens: number; satisfactionScore: number }>
}

// In-memory store for A/B tests (persists until restart; for full persistence, add Prisma model)
const store = new Map<string, AbTest>()

@Injectable()
export class AbTestingService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, input: { name: string; description?: string; variants: AbTestVariant[] }): AbTest {
    const id = randomUUID()
    const now = new Date().toISOString()
    const test: AbTest = {
      id,
      userId,
      name: input.name,
      description: input.description,
      variants: input.variants.map(v => ({ ...v, id: v.id ?? randomUUID() })),
      status: 'running',
      createdAt: now,
      updatedAt: now,
      results: {},
    }
    for (const v of test.variants) {
      test.results[v.id] = { runs: 0, avgLatencyMs: 0, avgTokens: 0, satisfactionScore: 0 }
    }
    store.set(id, test)
    return test
  }

  list(userId: string): AbTest[] {
    return Array.from(store.values()).filter(t => t.userId === userId)
  }

  get(userId: string, testId: string): AbTest | null {
    const t = store.get(testId)
    return t?.userId === userId ? t : null
  }

  pickVariant(userId: string, testId: string): AbTestVariant | null {
    const test = this.get(userId, testId)
    if (!test || test.variants.length === 0) return null
    // Round-robin: pick variant with fewest runs
    const sorted = [...test.variants].sort((a, b) => {
      return (test.results[a.id]?.runs ?? 0) - (test.results[b.id]?.runs ?? 0)
    })
    return sorted[0]
  }

  recordResult(
    userId: string,
    testId: string,
    variantId: string,
    result: { latencyMs: number; tokens: number; satisfaction?: number },
  ): void {
    const test = this.get(userId, testId)
    if (!test) return
    const r = test.results[variantId]
    if (!r) return
    const prev = r.runs
    r.runs += 1
    r.avgLatencyMs = (r.avgLatencyMs * prev + result.latencyMs) / r.runs
    r.avgTokens = (r.avgTokens * prev + result.tokens) / r.runs
    if (result.satisfaction != null) {
      r.satisfactionScore = (r.satisfactionScore * prev + result.satisfaction) / r.runs
    }
    test.updatedAt = new Date().toISOString()
    store.set(testId, test)
  }

  setWinner(userId: string, testId: string, variantId: string): AbTest | null {
    const test = this.get(userId, testId)
    if (!test) return null
    test.winnerVariantId = variantId
    test.status = 'completed'
    test.updatedAt = new Date().toISOString()
    store.set(testId, test)
    return test
  }

  delete(userId: string, testId: string): boolean {
    const test = this.get(userId, testId)
    if (!test) return false
    store.delete(testId)
    return true
  }
}
