import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { randomUUID } from 'crypto'
import type { BrowserAction, BrowserActionResult } from './browser-automation.service'
import { BrowserAutomationService } from './browser-automation.service'
import { DocumentStore } from '../prisma/document-store.service'

export interface WorkflowVariable {
  name: string
  description?: string
  defaultValue?: string
}

export interface RecordedStep {
  action: BrowserAction
  at: string
}

export interface BrowserWorkflow {
  id: string
  name: string
  description?: string
  steps: BrowserAction[]
  variables: WorkflowVariable[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowRunStepResult {
  index: number
  action: BrowserAction
  result: BrowserActionResult
}

export interface WorkflowRunResult {
  workflowId: string
  sessionId: string
  status: 'completed' | 'paused_for_approval' | 'failed'
  completedSteps: number
  steps: WorkflowRunStepResult[]
  pendingActionId?: string
  /** Index of the next step to run after approval (pass as `fromStep`). */
  nextStep?: number
}

interface ActiveRecording {
  sessionId: string
  userId: string
  startedAt: string
  steps: RecordedStep[]
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

const KIND = 'browser_workflows'

@Injectable()
export class WorkflowRecorderService {
  private readonly logger = new Logger(WorkflowRecorderService.name)
  private readonly recordings = new Map<string, ActiveRecording>()
  private readonly lastStopped = new Map<string, RecordedStep[]>()

  constructor(
    private readonly browser: BrowserAutomationService,
    private readonly moduleRef: ModuleRef,
    private readonly documents: DocumentStore,
  ) {}

  // ── recording ──────────────────────────────────────────────────────────────

  startRecording(sessionId: string, userId: string) {
    const rec: ActiveRecording = { sessionId, userId, startedAt: new Date().toISOString(), steps: [] }
    this.recordings.set(sessionId, rec)
    return { recording: true, sessionId, startedAt: rec.startedAt }
  }

  isRecording(sessionId: string) {
    return this.recordings.has(sessionId)
  }

  recordingStatus(sessionId: string) {
    const rec = this.recordings.get(sessionId)
    return { recording: !!rec, steps: rec?.steps.map((s) => s.action) ?? [] }
  }

  /** Called by the controller after a user-initiated action succeeded. */
  record(sessionId: string, action: BrowserAction) {
    const rec = this.recordings.get(sessionId)
    if (!rec || !action?.type || action.type === 'extract') return
    rec.steps.push({ action: { ...action }, at: new Date().toISOString() })
  }

  async stopRecording(sessionId: string, userId: string) {
    const rec = this.recordings.get(sessionId)
    if (!rec) throw new BadRequestException('Not recording')
    this.recordings.delete(sessionId)
    this.lastStopped.set(`${userId}:${sessionId}`, rec.steps)
    const steps = rec.steps.map((s) => s.action)
    const suggestedVariables = await this.suggestVariables(steps)
    return { recording: false, steps, suggestedVariables }
  }

  /** Suggest parameterizable inputs: LLM if available, heuristic fallback. */
  async suggestVariables(steps: BrowserAction[]): Promise<Array<WorkflowVariable & { stepIndex: number }>> {
    const candidates = steps
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.type === 'type' && a.value && a.value !== '••••')
    if (!candidates.length) return []

    const heuristic = candidates.map(({ a, i }, n) => ({
      stepIndex: i,
      name: this.nameFromSelector(a.selector) || `input_${n + 1}`,
      defaultValue: a.value,
      description: `Value typed into ${a.selector ?? 'field'}`,
    }))

    try {
      // Resolved lazily to avoid a hard module dependency (and circular imports).
      const { LLMService } = await import('../agent/llm.service')
      const llm: any = this.moduleRef.get(LLMService as any, { strict: false })
      if (!llm?.complete) return heuristic
      const res = await llm.complete(
        [{
          role: 'user',
          content:
            'Given these recorded browser "type" steps, return JSON array [{"stepIndex":n,"name":"snake_case","description":"..."}] ' +
            'only for values a user would likely change between runs (search terms, names, dates, emails). No prose.\n' +
            JSON.stringify(candidates.map(({ a, i }) => ({ stepIndex: i, selector: a.selector, value: a.value }))),
        }],
        [],
        'You design reusable browser automation workflows. Reply with JSON only.',
      )
      const match = String(res?.content ?? '').match(/\[[\s\S]*\]/)
      if (!match) return heuristic
      const parsed = JSON.parse(match[0]) as Array<{ stepIndex: number; name: string; description?: string }>
      const out = parsed
        .filter((p) => Number.isInteger(p.stepIndex) && steps[p.stepIndex]?.type === 'type' && /^[a-zA-Z_]\w*$/.test(p.name))
        .map((p) => ({ ...p, defaultValue: steps[p.stepIndex].value }))
      return out.length ? out : heuristic
    } catch (err: any) {
      this.logger.debug(`LLM variable suggestion unavailable: ${err?.message ?? err}`)
      return heuristic
    }
  }

  private nameFromSelector(selector?: string) {
    if (!selector) return ''
    const m = selector.match(/(?:name|id|placeholder|aria-label)\s*=\s*["']?([\w -]+)/i) ?? selector.match(/#([\w-]+)/)
    return m ? m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) : ''
  }

  // ── workflow store ─────────────────────────────────────────────────────────

  private async readAll(userId: string): Promise<BrowserWorkflow[]> {
    const parsed = await this.documents.read<unknown>(userId, KIND, () => [])
    return Array.isArray(parsed) ? (parsed as BrowserWorkflow[]) : []
  }

  private async writeAll(userId: string, items: BrowserWorkflow[]) {
    await this.documents.write(userId, KIND, items)
  }

  list(userId: string) {
    return this.readAll(userId)
  }

  async get(userId: string, id: string) {
    const wf = (await this.readAll(userId)).find((w) => w.id === id)
    if (!wf) throw new NotFoundException('Workflow not found')
    return wf
  }

  /**
   * Save a workflow. `steps` defaults to the last stopped recording for the session.
   * `variables[].stepIndex` replaces that step's value with a `{{name}}` placeholder.
   */
  async save(
    userId: string,
    body: {
      name: string
      description?: string
      sessionId?: string
      steps?: BrowserAction[]
      variables?: Array<WorkflowVariable & { stepIndex?: number }>
    },
  ) {
    const name = (body?.name ?? '').trim()
    if (!name) throw new BadRequestException('name is required')
    let steps: BrowserAction[] | undefined = body.steps
    if (!steps?.length && body.sessionId) {
      steps = this.lastStopped.get(`${userId}:${body.sessionId}`)?.map((s) => s.action)
    }
    if (!steps?.length) throw new BadRequestException('No recorded steps to save')
    steps = steps.map((s) => ({ ...s }))

    const variables: WorkflowVariable[] = []
    for (const v of body.variables ?? []) {
      if (!/^[a-zA-Z_]\w*$/.test(v.name ?? '')) continue
      if (typeof v.stepIndex === 'number' && steps[v.stepIndex]) {
        const step = steps[v.stepIndex]
        if (step.type === 'navigate') step.url = `{{${v.name}}}`
        else step.value = `{{${v.name}}}`
      }
      variables.push({ name: v.name, description: v.description, defaultValue: v.defaultValue })
    }

    const now = new Date().toISOString()
    const wf: BrowserWorkflow = {
      id: randomUUID(),
      name: name.slice(0, 120),
      description: body.description?.slice(0, 500),
      steps,
      variables,
      createdAt: now,
      updatedAt: now,
    }
    const all = await this.readAll(userId)
    all.unshift(wf)
    await this.writeAll(userId, all.slice(0, 200))
    if (body.sessionId) this.lastStopped.delete(`${userId}:${body.sessionId}`)
    return wf
  }

  async remove(userId: string, id: string) {
    const all = await this.readAll(userId)
    await this.writeAll(userId, all.filter((w) => w.id !== id))
    return { ok: true }
  }

  // ── replay ─────────────────────────────────────────────────────────────────

  private fill(text: string | undefined, inputs: Record<string, string>, vars: WorkflowVariable[]) {
    if (text == null) return text
    return text.replace(VAR_RE, (_m, key: string) => {
      if (inputs[key] != null) return String(inputs[key])
      const def = vars.find((v) => v.name === key)?.defaultValue
      if (def != null) return def
      throw new BadRequestException(`Missing input "${key}"`)
    })
  }

  /**
   * Replays steps through BrowserAutomationService.executeAction, so the same
   * approval gates apply. Stops when an action needs approval; resume with `fromStep`.
   */
  async run(
    userId: string,
    id: string,
    body: { sessionId?: string; inputs?: Record<string, string>; fromStep?: number },
  ): Promise<WorkflowRunResult> {
    const wf = await this.get(userId, id)
    const inputs = body?.inputs ?? {}
    let sessionId = body?.sessionId
    if (sessionId) {
      this.browser.assertOwner(sessionId, userId)
    } else {
      const first = wf.steps[0]
      const startUrl = first?.type === 'navigate' ? this.fill(first.url ?? first.value, inputs, wf.variables) : 'about:blank'
      const session = await this.browser.startSession(startUrl || 'about:blank', userId)
      sessionId = session.id
    }

    const results: WorkflowRunStepResult[] = []
    const start = Math.max(0, Math.min(body?.fromStep ?? 0, wf.steps.length))
    for (let i = start; i < wf.steps.length; i++) {
      const step = wf.steps[i]
      const action: BrowserAction = {
        ...step,
        url: this.fill(step.url, inputs, wf.variables),
        value: this.fill(step.value, inputs, wf.variables),
        selector: this.fill(step.selector, inputs, wf.variables),
      }
      const result = await this.browser.executeAction(sessionId, action)
      results.push({ index: i, action, result })
      if (result.status === 'needs_approval') {
        return {
          workflowId: wf.id, sessionId, status: 'paused_for_approval', completedSteps: i - start,
          steps: results, pendingActionId: result.pendingActionId, nextStep: i + 1,
        }
      }
      if (result.status === 'error') {
        return { workflowId: wf.id, sessionId, status: 'failed', completedSteps: i - start, steps: results, nextStep: i }
      }
    }
    return { workflowId: wf.id, sessionId, status: 'completed', completedSteps: results.length, steps: results }
  }
}
