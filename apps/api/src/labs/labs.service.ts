import { Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentBriefing,
  AgentDecisionJournalEntry,
  AgentFeatureId,
  AgentFeatureState,
  AgentGoal,
  AgentLabsSnapshot,
  AgentSafetyTier,
  CreateGoalInput,
  UpdateGoalInput,
} from '@openagents/shared'

const FEATURE_CATALOG: AgentFeatureState[] = [
  { id: 'voice_mode', title: 'Voice Mode', description: 'Push-to-talk, TTS replies, and interruption support.', maturity: 'planned', enabled: false },
  { id: 'goal_board', title: 'Goal Board', description: 'Persistent goals with priority, blockers, and progress.', maturity: 'active', enabled: true },
  { id: 'autonomous_followups', title: 'Autonomous Follow-ups', description: 'Proactive checks for unresolved tasks and nudges.', maturity: 'foundation', enabled: true },
  { id: 'memory_controls', title: 'Memory Controls', description: 'Pin, lock, expire, and forget controls for memory entries.', maturity: 'foundation', enabled: true },
  { id: 'decision_journal', title: 'Decision Journal', description: 'Logs options, risks, confidence, and selected actions.', maturity: 'active', enabled: true },
  { id: 'skill_marketplace', title: 'Skill Marketplace', description: 'Install and share skill packs with versions.', maturity: 'planned', enabled: false },
  { id: 'simulation_sandbox', title: 'Simulation Sandbox', description: 'Dry-run plans and tools before real execution.', maturity: 'foundation', enabled: true },
  { id: 'multi_provider_failover', title: 'Provider Failover', description: 'Auto fallback by reliability and policy.', maturity: 'foundation', enabled: true },
  { id: 'tool_permissions_scope', title: 'Scoped Tool Permissions', description: 'Allow/deny tools by scope, context, and risk.', maturity: 'foundation', enabled: true },
  { id: 'conversation_project_mode', title: 'Project Mode', description: 'Turn chats into tracked projects and milestones.', maturity: 'planned', enabled: false },
  { id: 'persona_presets', title: 'Persona Presets', description: 'Switchable execution personas with strict behavior.', maturity: 'foundation', enabled: true },
  { id: 'realtime_observability', title: 'Realtime Observability', description: 'Live timeline for thought mode, tool calls, cost, and latency.', maturity: 'active', enabled: true },
  { id: 'self_healing_runs', title: 'Self-healing Runs', description: 'Detect and recover from stuck or failed loops.', maturity: 'foundation', enabled: true },
  { id: 'smart_code_actions', title: 'Smart Code Actions', description: 'One-click patch/apply/test/rollback workflows.', maturity: 'foundation', enabled: true },
  { id: 'safety_tiers', title: 'Safety Tiers', description: 'Strict, balanced, and fast execution modes.', maturity: 'active', enabled: true },
  { id: 'benchmark_lab', title: 'Benchmark Lab', description: 'Prompt/model regression and performance comparisons.', maturity: 'active', enabled: true },
  { id: 'daily_briefings', title: 'Daily Briefings', description: 'Automated morning/evening summaries with recommendations.', maturity: 'active', enabled: true },
  { id: 'web_knowledge_pack', title: 'Web Knowledge Pack', description: 'Curated sources with freshness checks.', maturity: 'foundation', enabled: true },
  { id: 'team_mode', title: 'Team Mode', description: 'Shared memory channels and role-specific agents.', maturity: 'planned', enabled: false },
  { id: 'mobile_companion', title: 'Mobile Companion', description: 'Approve actions and monitor runtime from mobile.', maturity: 'planned', enabled: false },
]

const MAX_GOALS = 100
const MAX_JOURNAL = 300

@Injectable()
export class LabsService {
  async snapshot(userId: string): Promise<AgentLabsSnapshot> {
    const state = await this.load(userId)
    return this.toSnapshot(state)
  }

  async toggleFeature(userId: string, featureId: AgentFeatureId, enabled: boolean) {
    const state = await this.load(userId)
    const feature = state.features.find((item) => item.id === featureId)
    if (!feature) throw new NotFoundException(`Feature "${featureId}" not found.`)
    feature.enabled = !!enabled
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return this.toSnapshot(state)
  }

  async setSafetyTier(userId: string, safetyTier: AgentSafetyTier) {
    const state = await this.load(userId)
    state.safetyTier = safetyTier
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return this.toSnapshot(state)
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<AgentGoal> {
    const state = await this.load(userId)
    const now = new Date().toISOString()
    const goal: AgentGoal = {
      id: randomUUID(),
      title: input.title.trim().slice(0, 160),
      details: input.details?.trim().slice(0, 1000) || undefined,
      status: 'todo',
      priority: input.priority ?? 'medium',
      createdAt: now,
      updatedAt: now,
    }
    state.goals.unshift(goal)
    if (state.goals.length > MAX_GOALS) state.goals = state.goals.slice(0, MAX_GOALS)
    state.updatedAt = now
    await this.save(userId, state)
    return goal
  }

  async updateGoal(userId: string, goalId: string, input: UpdateGoalInput): Promise<AgentGoal> {
    const state = await this.load(userId)
    const goal = state.goals.find((item) => item.id === goalId)
    if (!goal) throw new NotFoundException('Goal not found.')

    if (typeof input.title === 'string') goal.title = input.title.trim().slice(0, 160)
    if (typeof input.details === 'string') goal.details = input.details.trim().slice(0, 1000) || undefined
    if (input.status) goal.status = input.status
    if (input.priority) goal.priority = input.priority
    goal.updatedAt = new Date().toISOString()
    state.updatedAt = goal.updatedAt
    await this.save(userId, state)
    return goal
  }

  async deleteGoal(userId: string, goalId: string) {
    const state = await this.load(userId)
    state.goals = state.goals.filter((item) => item.id !== goalId)
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return { ok: true as const }
  }

  async logDecision(userId: string, input: {
    summary: string
    options: string[]
    selected: string
    risk: 'low' | 'medium' | 'high'
    confidence: number
  }) {
    const state = await this.load(userId)
    const item: AgentDecisionJournalEntry = {
      id: randomUUID(),
      summary: input.summary.trim().slice(0, 400),
      options: input.options.map((value) => value.trim()).filter(Boolean).slice(0, 8),
      selected: input.selected.trim().slice(0, 220),
      risk: input.risk,
      confidence: this.clamp01(input.confidence),
      createdAt: new Date().toISOString(),
    }
    state.decisionJournal.unshift(item)
    if (state.decisionJournal.length > MAX_JOURNAL) {
      state.decisionJournal = state.decisionJournal.slice(0, MAX_JOURNAL)
    }
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return this.toSnapshot(state)
  }

  async briefing(userId: string): Promise<AgentBriefing> {
    const state = await this.load(userId)
    const topGoals = state.goals
      .filter((goal) => goal.status !== 'done')
      .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority))
      .slice(0, 5)
    const blockedGoals = state.goals.filter((goal) => goal.status === 'blocked').slice(0, 5)
    const recommendations = this.buildRecommendations(state, topGoals, blockedGoals)

    const summary = [
      `Safety tier: ${state.safetyTier}.`,
      `${topGoals.length} active priority goals.`,
      blockedGoals.length > 0 ? `${blockedGoals.length} blocked goals need unblocking.` : 'No blocked goals.',
      `Enabled features: ${state.features.filter((feature) => feature.enabled).length}/${state.features.length}.`,
    ].join(' ')

    return {
      generatedAt: new Date().toISOString(),
      summary,
      topGoals,
      blockedGoals,
      recommendations,
    }
  }

  private buildRecommendations(state: PersistedLabsState, topGoals: AgentGoal[], blockedGoals: AgentGoal[]) {
    const recommendations: string[] = []
    if (blockedGoals.length > 0) {
      recommendations.push('Resolve one blocked goal first to restore execution flow.')
    }
    if (!state.features.find((feature) => feature.id === 'autonomous_followups')?.enabled) {
      recommendations.push('Enable autonomous follow-ups to keep long-running work moving.')
    }
    if (!state.features.find((feature) => feature.id === 'decision_journal')?.enabled) {
      recommendations.push('Enable decision journal for traceable high-risk changes.')
    }
    if (topGoals.length > 0) {
      recommendations.push(`Focus next on "${topGoals[0].title}".`)
    } else {
      recommendations.push('Create at least one high-priority goal to anchor autonomous planning.')
    }
    if (state.safetyTier === 'fast') {
      recommendations.push('Fast safety tier is active. Switch to balanced for risky operations.')
    }
    return recommendations.slice(0, 6)
  }

  private priorityWeight(value: AgentGoal['priority']) {
    if (value === 'critical') return 4
    if (value === 'high') return 3
    if (value === 'medium') return 2
    return 1
  }

  private clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
  }

  private toSnapshot(state: PersistedLabsState): AgentLabsSnapshot {
    return {
      updatedAt: state.updatedAt,
      safetyTier: state.safetyTier,
      features: state.features,
      goals: state.goals,
      decisionJournal: state.decisionJournal,
    }
  }

  private async load(userId: string): Promise<PersistedLabsState> {
    const fullPath = await this.pathForUser(userId)
    try {
      const raw = await fs.readFile(fullPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedLabsState>
      return this.normalize(parsed)
    } catch {
      const next = this.defaultState()
      await this.save(userId, next)
      return next
    }
  }

  private normalize(raw: Partial<PersistedLabsState>): PersistedLabsState {
    const map = new Map<string, AgentFeatureState>()
    for (const feature of FEATURE_CATALOG) {
      map.set(feature.id, { ...feature })
    }

    for (const feature of raw.features ?? []) {
      const base = map.get(feature.id)
      if (!base) continue
      map.set(feature.id, {
        ...base,
        enabled: typeof feature.enabled === 'boolean' ? feature.enabled : base.enabled,
        maturity: feature.maturity ?? base.maturity,
        title: feature.title?.trim() ? feature.title.trim() : base.title,
        description: feature.description?.trim() ? feature.description.trim() : base.description,
      })
    }

    return {
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      safetyTier: this.normalizeSafetyTier(raw.safetyTier),
      features: FEATURE_CATALOG.map((feature) => map.get(feature.id) ?? feature),
      goals: this.normalizeGoals(raw.goals),
      decisionJournal: this.normalizeJournal(raw.decisionJournal),
    }
  }

  private normalizeSafetyTier(value: unknown): AgentSafetyTier {
    if (value === 'strict' || value === 'balanced' || value === 'fast') return value
    return 'balanced'
  }

  private normalizeGoals(goals: unknown): AgentGoal[] {
    if (!Array.isArray(goals)) return []
    const out: AgentGoal[] = []
    for (const goal of goals) {
      if (!goal || typeof goal !== 'object') continue
      const row = goal as Partial<AgentGoal>
      if (!row.id || !row.title) continue
      out.push({
        id: String(row.id),
        title: String(row.title).slice(0, 160),
        details: row.details ? String(row.details).slice(0, 1000) : undefined,
        status: row.status === 'doing' || row.status === 'blocked' || row.status === 'done' ? row.status : 'todo',
        priority: row.priority === 'low' || row.priority === 'high' || row.priority === 'critical' ? row.priority : 'medium',
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
      })
    }
    return out.slice(0, MAX_GOALS)
  }

  private normalizeJournal(journal: unknown): AgentDecisionJournalEntry[] {
    if (!Array.isArray(journal)) return []
    const out: AgentDecisionJournalEntry[] = []
    for (const entry of journal) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Partial<AgentDecisionJournalEntry>
      if (!row.id || !row.summary || !row.selected) continue
      out.push({
        id: String(row.id),
        summary: String(row.summary).slice(0, 400),
        options: Array.isArray(row.options) ? row.options.map((value) => String(value)).slice(0, 8) : [],
        selected: String(row.selected).slice(0, 220),
        risk: row.risk === 'low' || row.risk === 'high' ? row.risk : 'medium',
        confidence: this.clamp01(Number(row.confidence)),
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      })
    }
    return out.slice(0, MAX_JOURNAL)
  }

  private defaultState(): PersistedLabsState {
    return {
      updatedAt: new Date().toISOString(),
      safetyTier: 'balanced',
      features: FEATURE_CATALOG.map((feature) => ({ ...feature })),
      goals: [],
      decisionJournal: [],
    }
  }

  private async save(userId: string, state: PersistedLabsState) {
    const fullPath = await this.pathForUser(userId)
    await fs.writeFile(fullPath, JSON.stringify(state, null, 2), 'utf8')
  }

  private async pathForUser(userId: string) {
    const root = path.resolve(process.cwd(), 'data', 'labs')
    await fs.mkdir(root, { recursive: true })
    return path.join(root, `${userId}.json`)
  }
}

interface PersistedLabsState {
  updatedAt: string
  safetyTier: AgentSafetyTier
  features: AgentFeatureState[]
  goals: AgentGoal[]
  decisionJournal: AgentDecisionJournalEntry[]
}

