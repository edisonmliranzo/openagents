import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { LLMService } from '../agent/llm.service'
import { ToolsService } from '../tools/tools.service'
import { isSideEffectTool, truncate } from '../tasks/task-plan'
import { UserJsonStore } from './user-json-store'

export type DurableStepKind = 'tool' | 'llm' | 'delay' | 'note'
export type DurableStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
export type DurableRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface DurableAttempt {
  attempt: number
  startedAt: string
  finishedAt?: string
  ok?: boolean
  error?: string
}

export interface DurableStep {
  index: number
  kind: DurableStepKind
  name: string
  tool?: string
  input?: Record<string, unknown>
  instruction?: string
  delayMs?: number
  status: DurableStepStatus
  attempts: DurableAttempt[]
  output?: string
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface DurableRun {
  id: string
  userId: string
  title: string
  status: DurableRunStatus
  cursor: number
  steps: DurableStep[]
  maxAttempts: number
  backoffMs: number
  /** Persisted so a restart honours an in-progress backoff / delay. */
  waitUntil?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
  resumes: number
}

export interface DurableStepInput {
  kind: DurableStepKind
  name?: string
  tool?: string
  input?: Record<string, unknown>
  instruction?: string
  delayMs?: number
}

const MAX_STEPS = 50
const MAX_OUTPUT = 4000
const MAX_DELAY_MS = 10 * 60_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

@Injectable()
export class DurableService implements OnModuleInit {
  private readonly logger = new Logger(DurableService.name)
  private readonly store = new UserJsonStore<DurableRun>('durable-runs', 200)
  /** `${userKey}:${runId}` currently being driven by this process. */
  private readonly driving = new Set<string>()

  constructor(
    private readonly llm: LLMService,
    private readonly tools: ToolsService,
  ) {}

  /** Auto-resume every run that was still `running` when the process last stopped. */
  onModuleInit() {
    setTimeout(() => {
      try {
        for (const key of this.store.listUserKeys()) {
          for (const run of this.store.load(key)) {
            if (run.status === 'running') {
              run.resumes += 1
              this.persist(run)
              this.logger.log(`Auto-resuming durable run ${run.id} at step ${run.cursor}`)
              this.kick(run.userId, run.id)
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Durable resume scan failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, 5_000)
  }

  // ── persistence helpers ────────────────────────────────────────────────
  private persist(run: DurableRun) {
    run.updatedAt = new Date().toISOString()
    const all = this.store.load(run.userId)
    const i = all.findIndex((r) => r.id === run.id)
    if (i >= 0) all[i] = run
    else all.push(run)
    this.store.save(run.userId, all)
  }

  private find(userId: string, id: string): DurableRun {
    const run = this.store.load(userId).find((r) => r.id === id)
    if (!run) throw new NotFoundException('Durable run not found')
    return run
  }

  // ── public API ─────────────────────────────────────────────────────────
  list(userId: string) {
    return this.store
      .load(userId)
      .map((r) => this.summary(r))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(userId: string, id: string) {
    return this.find(userId, id)
  }

  create(
    userId: string,
    dto: { title: string; steps: DurableStepInput[]; maxAttempts?: number; backoffMs?: number; autoStart?: boolean },
  ) {
    if (!dto.steps?.length) throw new BadRequestException('At least one step is required')
    if (dto.steps.length > MAX_STEPS) throw new BadRequestException(`At most ${MAX_STEPS} steps`)
    const steps: DurableStep[] = dto.steps.map((s, index) => {
      if (s.kind === 'tool') {
        if (!s.tool) throw new BadRequestException(`Step ${index + 1}: tool name required`)
        if (isSideEffectTool(s.tool)) {
          throw new BadRequestException(`Step ${index + 1}: side-effect tool "${s.tool}" is not allowed in unattended durable runs`)
        }
      }
      if (s.kind === 'llm' && !s.instruction?.trim()) throw new BadRequestException(`Step ${index + 1}: instruction required`)
      return {
        index,
        kind: s.kind,
        name: (s.name?.trim() || s.tool || s.instruction?.slice(0, 40) || s.kind).slice(0, 120),
        tool: s.tool,
        input: s.input,
        instruction: s.instruction?.slice(0, 4000),
        delayMs: s.kind === 'delay' ? Math.min(Math.max(0, s.delayMs ?? 0), MAX_DELAY_MS) : undefined,
        status: 'pending',
        attempts: [],
      }
    })
    const now = new Date().toISOString()
    const autoStart = dto.autoStart !== false
    const run: DurableRun = {
      id: randomUUID(),
      userId,
      title: dto.title.slice(0, 160),
      status: autoStart ? 'running' : 'paused',
      cursor: 0,
      steps,
      maxAttempts: Math.min(Math.max(1, dto.maxAttempts ?? 3), 8),
      backoffMs: Math.min(Math.max(100, dto.backoffMs ?? 1000), 60_000),
      createdAt: now,
      updatedAt: now,
      resumes: 0,
    }
    this.persist(run)
    if (autoStart) this.kick(userId, run.id)
    return run
  }

  pause(userId: string, id: string) {
    const run = this.find(userId, id)
    if (run.status !== 'running') throw new BadRequestException(`Cannot pause a ${run.status} run`)
    run.status = 'paused'
    this.persist(run)
    return run
  }

  resume(userId: string, id: string) {
    const run = this.find(userId, id)
    if (run.status !== 'paused' && run.status !== 'failed') throw new BadRequestException(`Cannot resume a ${run.status} run`)
    const step = run.steps[run.cursor]
    if (run.status === 'failed' && step) {
      // Retry the failed step from scratch.
      step.status = 'pending'
      step.error = undefined
    }
    run.status = 'running'
    run.error = undefined
    run.finishedAt = undefined
    this.persist(run)
    this.kick(userId, id)
    return run
  }

  cancel(userId: string, id: string) {
    const run = this.find(userId, id)
    if (run.status === 'completed' || run.status === 'cancelled') return run
    run.status = 'cancelled'
    run.finishedAt = new Date().toISOString()
    for (const s of run.steps) if (s.status === 'pending' || s.status === 'running') s.status = 'skipped'
    this.persist(run)
    return run
  }

  remove(userId: string, id: string) {
    const run = this.find(userId, id)
    if (run.status === 'running') throw new BadRequestException('Cancel the run before deleting it')
    this.store.save(
      userId,
      this.store.load(userId).filter((r) => r.id !== id),
    )
    return { ok: true }
  }

  // ── engine ─────────────────────────────────────────────────────────────
  private summary(r: DurableRun) {
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      cursor: r.cursor,
      totalSteps: r.steps.length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      finishedAt: r.finishedAt ?? null,
      error: r.error ?? null,
      resumes: r.resumes,
    }
  }

  private kick(userId: string, id: string) {
    const key = `${userId}:${id}`
    if (this.driving.has(key)) return
    this.driving.add(key)
    void this.drive(userId, id)
      .catch((err) => this.logger.warn(`Durable run ${id} crashed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => this.driving.delete(key))
  }

  private live(userId: string, id: string): DurableRun | null {
    const run = this.store.load(userId).find((r) => r.id === id)
    return run && run.status === 'running' ? run : null
  }

  private async drive(userId: string, id: string) {
    for (;;) {
      let run = this.live(userId, id)
      if (!run) return
      if (run.waitUntil) {
        const wait = new Date(run.waitUntil).getTime() - Date.now()
        if (wait > 0) await sleep(Math.min(wait, 5_000))
        run = this.live(userId, id)
        if (!run) return
        if (new Date(run.waitUntil ?? 0).getTime() > Date.now()) continue
        run.waitUntil = undefined
      }
      const step = run.steps[run.cursor]
      if (!step) {
        run.status = 'completed'
        run.finishedAt = new Date().toISOString()
        this.persist(run)
        return
      }

      step.status = 'running'
      step.startedAt ??= new Date().toISOString()
      const attempt: DurableAttempt = { attempt: step.attempts.length + 1, startedAt: new Date().toISOString() }
      step.attempts.push(attempt)
      this.persist(run) // checkpoint BEFORE side effects so a crash mid-step is visible and retried

      let output = ''
      let error: string | undefined
      try {
        output = await this.executeStep(run, step)
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      // The run may have been paused/cancelled while the step was in flight.
      const fresh = this.store.load(userId).find((r) => r.id === id)
      if (!fresh) return
      const fstep = fresh.steps[step.index]
      const fattempt = fstep.attempts[fstep.attempts.length - 1]
      fattempt.finishedAt = new Date().toISOString()
      fattempt.ok = !error
      if (error) fattempt.error = error.slice(0, 500)
      if (fresh.status === 'cancelled') {
        this.persist(fresh)
        return
      }
      if (!error) {
        fstep.status = 'succeeded'
        fstep.output = output
        fstep.error = undefined
        fstep.finishedAt = new Date().toISOString()
        fresh.cursor = step.index + 1
        if (fresh.cursor >= fresh.steps.length && fresh.status === 'running') {
          fresh.status = 'completed'
          fresh.finishedAt = new Date().toISOString()
        }
      } else if (fstep.attempts.length >= fresh.maxAttempts) {
        fstep.status = 'failed'
        fstep.error = error.slice(0, 500)
        fstep.finishedAt = new Date().toISOString()
        fresh.error = `Step ${step.index + 1} failed: ${fstep.error}`
        if (fresh.status === 'running') {
          fresh.status = 'failed'
          fresh.finishedAt = new Date().toISOString()
        }
      } else {
        fstep.status = 'pending'
        fstep.error = error.slice(0, 500)
        const delay = Math.min(fresh.backoffMs * 2 ** (fstep.attempts.length - 1), 5 * 60_000)
        fresh.waitUntil = new Date(Date.now() + delay).toISOString()
      }
      this.persist(fresh)
      if (fresh.status !== 'running') return
    }
  }

  private async executeStep(run: DurableRun, step: DurableStep): Promise<string> {
    switch (step.kind) {
      case 'note':
        return step.instruction ?? step.name
      case 'delay': {
        // Sleep in slices so pause/cancel are noticed promptly.
        const until = Date.now() + (step.delayMs ?? 0)
        while (Date.now() < until) {
          await sleep(Math.min(500, until - Date.now()))
          if (!this.live(run.userId, run.id)) break
        }
        return `Waited ${step.delayMs ?? 0}ms`
      }
      case 'tool': {
        if (!step.tool || isSideEffectTool(step.tool)) throw new Error('Tool not permitted in durable run')
        const res = await this.tools.execute(step.tool, step.input ?? {}, run.userId)
        if (!res.success) throw new Error(res.error || 'Tool failed')
        return truncate(typeof res.output === 'string' ? res.output : JSON.stringify(res.output ?? null), MAX_OUTPUT)
      }
      case 'llm': {
        const prior = run.steps
          .filter((s) => s.status === 'succeeded' && s.output)
          .map((s) => `Step ${s.index + 1} (${s.name}): ${truncate(s.output ?? '', 1200)}`)
          .join('\n')
        const res = await this.llm.complete(
          [{ role: 'user', content: `${step.instruction}\n\nResults so far:\n${prior || '(none)'}` }],
          [],
          'You are executing one step of a durable multi-step agent run. Answer concisely.',
        )
        return truncate(res.content ?? '', MAX_OUTPUT)
      }
      default:
        throw new Error('Unknown step kind')
    }
  }
}
