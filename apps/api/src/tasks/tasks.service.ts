import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { ToolsService } from '../tools/tools.service'
import { LLM_MODELS } from '@openagents/shared'
import {
  describeInputSchema,
  extractJson,
  isSideEffectTool,
  missingRequired,
  parsePlan,
  parseVerdict,
  truncate,
  type PlanStep,
} from './task-plan'

const MAX_REPLANS = 2
const MAX_STEPS_DEFAULT = 12
const MAX_OUTPUT_CHARS = 4000

type StoredPlan = PlanStep & { approved?: boolean }

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name)
  /** Tasks currently being driven by this process. Prevents double execution. */
  private readonly driving = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly tools: ToolsService,
    private readonly config: ConfigService,
  ) {}

  /** Verifier model: configurable, defaults to the fast local model for CPU boxes. */
  private verifierModel(): string {
    const configured = (this.config.get<string>('TASK_VERIFIER_MODEL') ?? '').trim()
    return configured.length ? configured.slice(0, 200) : LLM_MODELS.ollama.default
  }

  /** Resume work that was in flight when the process last stopped. */
  onModuleInit() {
    setTimeout(() => {
      void this.prisma.agentTask
        .findMany({ where: { status: { in: ['planning', 'running'] } }, select: { id: true } })
        .then((rows) => {
          for (const r of rows) void this.drive(r.id)
          if (rows.length) this.logger.log(`Resumed ${rows.length} task(s) after restart`)
        })
        .catch((err) => this.logger.warn(`Task recovery failed: ${err?.message ?? err}`))
    }, 3000).unref?.()
  }

  async create(userId: string, input: { goal: string; successCriteria?: string; target?: string; maxSteps?: number }) {
    const goal = String(input.goal ?? '').trim()
    if (goal.length < 8) throw new BadRequestException('Describe the goal in at least a sentence.')
    const target = (input.target ?? 'server').trim()
    if (target !== 'server') {
      throw new BadRequestException('Local execution is not connected yet. Use target "server" for now.')
    }
    const task = await this.prisma.agentTask.create({
      data: {
        userId,
        title: goal.slice(0, 80),
        goal: goal.slice(0, 2000),
        successCriteria: String(input.successCriteria ?? '').trim().slice(0, 1000),
        target,
        status: 'planning',
        maxSteps: Math.min(Math.max(Number(input.maxSteps) || MAX_STEPS_DEFAULT, 1), 25),
        startedAt: new Date(),
      },
    })
    await this.event(task.id, 'planned', 'Task created')
    void this.drive(task.id)
    return task
  }

  list(userId: string) {
    return this.prisma.agentTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, goal: true, status: true, cursor: true, replans: true, createdAt: true, finishedAt: true, error: true },
    })
  }

  async get(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { id, userId },
      include: { events: { orderBy: { createdAt: 'asc' }, take: 200 } },
    })
    if (!task) throw new NotFoundException('Task not found')
    return task
  }

  async approve(userId: string, id: string) {
    const task = await this.owned(userId, id)
    if (task.status !== 'awaiting_approval') throw new BadRequestException('Task is not waiting for approval')
    const plan = this.readPlan(task.plan)
    const step = plan[task.cursor]
    if (!step) throw new BadRequestException('No pending step to approve')
    step.approved = true
    await this.prisma.agentTask.update({
      where: { id },
      data: { plan: JSON.stringify(plan), status: 'running' },
    })
    await this.event(id, 'approved', `Approved: ${step.tool ?? step.instruction}`)
    void this.drive(id)
    return { ok: true }
  }

  async cancel(userId: string, id: string) {
    const task = await this.owned(userId, id)
    if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') return task
    await this.prisma.agentTask.update({ where: { id }, data: { status: 'cancelled', finishedAt: new Date() } })
    await this.event(id, 'cancelled', 'Cancelled by user')
    return { ok: true }
  }

  private async owned(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId } })
    if (!task) throw new NotFoundException('Task not found')
    return task
  }

  private readPlan(raw: string): StoredPlan[] {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }

  private async event(taskId: string, kind: string, message: string, data?: unknown) {
    await this.prisma.agentTaskEvent
      .create({ data: { taskId, kind, message: truncate(message, 500), data: data ? truncate(JSON.stringify(data), 2000) : null } })
      .catch(() => undefined)
  }

  private async save(taskId: string, patch: Record<string, unknown>) {
    await this.prisma.agentTask.update({ where: { id: taskId }, data: patch as any })
  }

  /** The execution loop. Idempotent: safe to call again after a restart. */
  private async drive(taskId: string): Promise<void> {
    if (this.driving.has(taskId)) return
    this.driving.add(taskId)
    try {
      let task = await this.prisma.agentTask.findUnique({ where: { id: taskId } })
      if (!task) return
      if (task.status === 'planning') {
        const ok = await this.plan(task)
        if (!ok) return
        task = await this.prisma.agentTask.findUnique({ where: { id: taskId } })
        if (!task) return
      }
      await this.runSteps(taskId)
    } catch (err: any) {
      this.logger.error(`Task ${taskId} crashed: ${err?.message ?? err}`)
      await this.save(taskId, { status: 'failed', error: truncate(String(err?.message ?? err), 500), finishedAt: new Date() }).catch(() => undefined)
      await this.event(taskId, 'error', String(err?.message ?? err))
    } finally {
      this.driving.delete(taskId)
    }
  }

  private async plan(task: any): Promise<boolean> {
    const available = await this.tools.getAvailableForUser(task.userId).catch(() => [] as any[])
    const allowed = new Set(available.map((t: any) => t.name))
    const toolList = available
      .slice(0, 80)
      .map((t: any) => `- ${t.name}(${describeInputSchema(t.inputSchema)}): ${truncate(String(t.description ?? ''), 140)}`)
      .join('\n')
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Goal: ${task.goal}\nSuccess criteria: ${task.successCriteria || 'the goal is fully answered with concrete findings'}\n\nAvailable tools (use only these names):\n${toolList || '(none)'}\n\nReply with JSON only: {"steps":[{"kind":"tool","tool":"<name>","input":{...},"instruction":"why"} or {"kind":"llm","instruction":"what to write or decide"}]}. At most ${task.maxSteps} steps, each instruction under 15 words, no commentary. Gather facts with tools before writing with llm steps.`,
        },
      ],
      [],
      'You are a planner for a personal AI agent. Produce the smallest reliable plan. Never invent tool names.',
      'ollama',
      undefined,
      undefined,
      LLM_MODELS.ollama.default,
    )
    const { steps, errors } = parsePlan(res.content, allowed, task.maxSteps)
    if (steps.length === 0) {
      await this.save(task.id, { status: 'failed', error: errors.join('; ') || 'planning failed', finishedAt: new Date() })
      await this.event(task.id, 'error', 'Planning failed', { errors, planner: truncate(res.content, 600) })
      return false
    }
    await this.save(task.id, { plan: JSON.stringify(steps), status: 'running', cursor: 0 })
    await this.event(task.id, 'planned', `Plan with ${steps.length} step(s)`, { steps: steps.map((s) => s.instruction) })
    return true
  }

  private async runSteps(taskId: string): Promise<void> {
    let executed = 0
    for (;;) {
      const task = await this.prisma.agentTask.findUnique({ where: { id: taskId } })
      if (!task || task.status !== 'running') return

      const plan = this.readPlan(task.plan)
      if (task.cursor >= plan.length) {
        const more = await this.verify(taskId)
        if (more) continue
        return
      }
      if (executed >= task.maxSteps) {
        await this.save(taskId, { status: 'failed', error: 'Step budget exhausted', finishedAt: new Date() })
        await this.event(taskId, 'error', 'Step budget exhausted')
        return
      }

      const step = plan[task.cursor]
      if (step.kind === 'tool' && step.tool && isSideEffectTool(step.tool) && !step.approved) {
        await this.save(taskId, { status: 'awaiting_approval' })
        await this.event(taskId, 'approval_needed', `Needs your approval: ${step.tool}`, { input: step.input, why: step.instruction })
        return
      }

      executed += 1
      step.status = 'running'
      await this.save(taskId, { plan: JSON.stringify(plan) })
      await this.event(taskId, 'step_started', step.instruction)

      try {
        step.output = await this.execute(task, step, plan.slice(0, task.cursor).filter((s) => s.output))
        step.status = 'done'
        step.error = undefined
        await this.save(taskId, { plan: JSON.stringify(plan), cursor: task.cursor + 1 })
        await this.event(taskId, 'step_done', truncate(step.output, 200))
      } catch (err: any) {
        step.status = 'failed'
        step.error = truncate(String(err?.message ?? err), 500)
        await this.save(taskId, { plan: JSON.stringify(plan) })
        await this.event(taskId, 'step_failed', step.error)
        if (task.replans >= MAX_REPLANS) {
          await this.save(taskId, { status: 'failed', error: `Step failed: ${step.error}`, finishedAt: new Date() })
          return
        }
        await this.replan(task, plan.slice(0, task.cursor), `step failed: ${step.error}`)
      }
    }
  }

  private async execute(task: any, step: StoredPlan, prior: StoredPlan[]): Promise<string> {
    if (step.kind === 'tool' && step.tool) {
      let input = step.input ?? {}
      const schema = (await this.tools.getAvailableForUser(task.userId).catch(() => [] as any[])).find((t: any) => t.name === step.tool)?.inputSchema as Record<string, unknown> | undefined
      if (missingRequired(schema, input).length) {
        // The planner left required inputs empty: fill them from the schema and the step's intent.
        const filled = await this.llm.complete(
          [{ role: 'user', content: `Tool: ${step.tool}\nInput schema: ${JSON.stringify(schema).slice(0, 1200)}\nStep: ${step.instruction}\nGoal: ${task.goal}\n\nReply with the JSON input object only.` }],
          [],
          'You fill tool inputs precisely. Output one JSON object and nothing else.',
          'ollama',
        )
        input = { ...input, ...((extractJson(filled.content) as Record<string, unknown>) ?? {}) }
        const stillMissing = missingRequired(schema, input)
        if (stillMissing.length) throw new Error(`missing required input(s): ${stillMissing.join(', ')}`)
      }
      const res: any = await this.tools.execute(step.tool, input, task.userId)
      if (res?.success === false) throw new Error(String(res?.error ?? res?.output ?? 'tool reported failure'))
      const payload = res?.data ?? res?.output ?? res
      return truncate(typeof payload === 'string' ? payload : JSON.stringify(payload), MAX_OUTPUT_CHARS)
    }
    const context = prior.slice(-4).map((s) => `[${s.instruction}] ${truncate(s.output ?? '', 1200)}`).join('\n')
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Overall goal: ${task.goal}\nSuccess criteria: ${task.successCriteria || '(none given)'}\n\nWork so far:\n${context || '(nothing yet)'}\n\nYour step: ${step.instruction}\n\nDo this step now. Be concrete and specific.`,
        },
      ],
      [],
      'You execute one step of a larger task for a personal AI agent. Output only the step result.',
      'ollama',
    )
    const out = res.content.trim()
    if (!out) throw new Error('empty step output')
    return truncate(out, MAX_OUTPUT_CHARS)
  }

  private async replan(task: any, done: StoredPlan[], reason: string): Promise<void> {
    const count = task.replans + 1
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Goal: ${task.goal}\nSuccess criteria: ${task.successCriteria || '(none)'}\nCompleted: ${done.map((s) => s.instruction).join(' | ') || 'nothing'}\nProblem: ${reason}\n\nReply JSON only: {"steps":[...]} with at most 4 remaining steps to finish the goal (tool steps: {"kind":"tool","tool":"<name>","input":{},"instruction":"..."}; llm steps: {"kind":"llm","instruction":"..."}).`,
        },
      ],
      [],
      'You revise a plan for a personal AI agent after a problem. Keep it short and use real tool names only.',
      'ollama',
      undefined,
      undefined,
      LLM_MODELS.ollama.default,
    )
    const allowed = new Set((await this.tools.getAvailableForUser(task.userId).catch(() => [] as any[])).map((t: any) => t.name))
    const { steps } = parsePlan(res.content, allowed, 4)
    const next = [...done, ...steps]
    await this.save(task.id, { plan: JSON.stringify(next), replans: count })
    await this.event(task.id, 'replanned', `Replan ${count}: ${steps.length} new step(s)`, { reason })
    if (steps.length === 0) {
      // No usable revision: park the cursor at the end so the loop falls
      // through to the verifier instead of failing banking on completed work.
      await this.save(task.id, { cursor: next.length })
      await this.event(task.id, 'replanned', `Replan ${count}: no new steps, verifying completed work`, { reason })
    }
  }

  /** Returns true when the loop should continue with revised steps. */
  private async verify(taskId: string): Promise<boolean> {
    const task = await this.prisma.agentTask.findUnique({ where: { id: taskId } })
    if (!task) return false
    const plan = this.readPlan(task.plan)
    const outputs = plan.filter((s) => s.output).map((s) => `[${s.instruction}] ${truncate(s.output ?? '', 1500)}`).join('\n')
    const toolSteps = plan.filter((s) => s.kind === 'tool')
    const hadToolEvidence = toolSteps.length === 0 || toolSteps.some((s) => s.status === 'done')
    // The larger local model judges completion; the fast model is too easy to fool.
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Goal: ${task.goal}\nSuccess criteria: ${task.successCriteria || 'the goal is fully answered with concrete content'}\n\nResults from the work so far:\n${outputs || '(no results)'}\n\nCheck each success criterion against the results. Then write the final answer for the user, based only on the results above. Keep the answer under 600 words. Reply with JSON only: {"met": true or false, "gaps": [list of unmet criteria], "answer": "the complete final answer"}`,
        },
      ],
      [],
      'You are a strict verifier. Mark met only when the results truly satisfy every criterion. Never claim work that the results do not show.',
      'ollama',
      undefined,
      undefined,
      this.verifierModel(),
    )
    const verdict = parseVerdict(res.content, hadToolEvidence)
    if (!verdict.met && task.replans < MAX_REPLANS && verdict.gaps.length) {
      await this.replan(task, plan, `verifier gaps: ${verdict.gaps.join('; ')}`)
      await this.event(taskId, 'verified', 'Not met yet; continuing', verdict)
      return true
    }
    await this.save(taskId, {
      status: verdict.met ? 'done' : 'failed',
      result: verdict.answer || outputs.slice(0, MAX_OUTPUT_CHARS),
      verdict: JSON.stringify(verdict),
      error: verdict.met ? null : `Not fully met: ${verdict.gaps.join('; ')}`,
      finishedAt: new Date(),
    })
    await this.event(taskId, 'verified', verdict.met ? 'Verified: goal met' : 'Finished without meeting criteria', verdict)
    return false
  }
}
