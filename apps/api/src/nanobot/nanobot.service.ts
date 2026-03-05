import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { NanobotConfigService } from './config/nanobot-config.service'
import { NanobotSessionService } from './session/nanobot-session.service'
import { NanobotChannelsService } from './channels/nanobot-channels.service'
import { NanobotCliService } from './cli/nanobot-cli.service'
import { NanobotBusService } from './bus/nanobot-bus.service'
import { NanobotSkillsRegistry } from './agent/nanobot-skills.registry'
import { NanobotPersonalityService } from './agent/nanobot-personality.service'
import { NanobotAliveStateService } from './agent/nanobot-alive-state.service'
import { NanobotCronService } from './cron/nanobot-cron.service'
import { NanobotSubagentService } from './agent/nanobot-subagent.service'
import { NanobotOrchestrationService } from './agent/nanobot-orchestration.service'
import { NanobotPresenceService } from './agent/nanobot-presence.service'
import { NanobotVoiceService } from './agent/nanobot-voice.service'
import { NanobotRuntimeIntelligenceService } from './agent/nanobot-runtime-intelligence.service'
import { NanobotMarketplaceService } from './marketplace/nanobot-marketplace.service'
import { NanobotTrustService } from './trust/nanobot-trust.service'
import { NanobotHeartbeatService } from './heartbeat/nanobot-heartbeat.service'
import { CronService } from '../cron/cron.service'
import { MemoryService } from '../memory/memory.service'
import { ApprovalsService } from '../approvals/approvals.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { ToolsService } from '../tools/tools.service'
import type {
  CreateNanobotSpecialistRunInput,
  ExecuteNanobotSpecialistRunInput,
  NanobotSkillChatInput,
  NanobotSkillChatResult,
  NanobotSkillDraftInput,
  NanobotConfigPatch,
  NanobotMarketplaceExportInput,
  NanobotMarketplaceImportInput,
  NanobotVoiceSynthesisInput,
  NanobotVoiceTranscriptionInput,
  UpdateNanobotAutonomyInput,
} from './types'
import type { CronSelfHealInput } from '@openagents/shared'
import type { LLMProvider } from '@openagents/shared'

@Injectable()
export class NanobotService {
  private readonly logger = new Logger(NanobotService.name)

  constructor(
    private config: NanobotConfigService,
    private sessions: NanobotSessionService,
    private channels: NanobotChannelsService,
    private cli: NanobotCliService,
    private bus: NanobotBusService,
    private skills: NanobotSkillsRegistry,
    private personality: NanobotPersonalityService,
    private alive: NanobotAliveStateService,
    private subagents: NanobotSubagentService,
    private orchestration: NanobotOrchestrationService,
    private cron: NanobotCronService,
    private presence: NanobotPresenceService,
    private voice: NanobotVoiceService,
    private runtimeIntelligence: NanobotRuntimeIntelligenceService,
    private marketplace: NanobotMarketplaceService,
    private trust: NanobotTrustService,
    private heartbeat: NanobotHeartbeatService,
    private cronService: CronService,
    private memory: MemoryService,
    private approvals: ApprovalsService,
    private llm: LLMService,
    private users: UsersService,
    private tools: ToolsService,
  ) {}

  async health(userId: string) {
    const [activeSkills, personality] = await Promise.all([
      this.skills.listForUser(userId),
      this.personality.getForUser(userId),
    ])
    const runtimeAutomation = this.runtimeIntelligence.getState(userId)
    const latestRisk = this.approvals.getLatestRiskState(userId)

    return {
      config: this.config.toJSON(),
      activeSessions: this.sessions.listForUser(userId),
      channels: this.channels.listSupportedChannels(),
      cliHints: this.cli.commandHints(),
      activeSkills,
      personaProfiles: this.personality.listProfiles(),
      personality,
      alive: this.alive.getForUser(userId),
      subagents: this.subagents.listForUser(userId),
      orchestration: this.orchestration.listForUser(userId, 10),
      runtimeAutomation: {
        ...runtimeAutomation,
        approvalRisk: {
          level: latestRisk.level,
          score: latestRisk.score,
          reason: latestRisk.reason,
          autoApproved: latestRisk.autoApproved,
          autonomyWithinWindow: latestRisk.autonomyWithinWindow,
          toolName: latestRisk.toolName,
        },
      },
      heartbeat: this.heartbeat.getStatus(userId),
      memoryCuration: this.memory.getCurationStatus(userId),
    }
  }

  events(limit = 60) {
    return this.bus.listRecent(limit)
  }

  async listSkills(userId: string) {
    return this.skills.listForUser(userId)
  }

  async setSkillEnabled(userId: string, skillId: string, enabled: boolean) {
    const next = await this.skills.setSkillEnabled(userId, skillId, enabled)
    this.bus.publish('run.event', {
      source: 'nanobot.skills',
      userId,
      skillId,
      enabled,
    })
    return next
  }

  async chatSkillBuilder(userId: string, input: NanobotSkillChatInput): Promise<NanobotSkillChatResult> {
    const saveRequested = Boolean(input.save)

    const availableTools = await this.tools.getAvailableForUser(userId)
    const allowedToolNames = availableTools.map((tool) => tool.name)

    const directDraft = this.normalizeSkillDraft(input.draft, allowedToolNames)
    if (saveRequested && directDraft) {
      const upserted = await this.skills.upsertCustomSkill(userId, directDraft)
      return {
        draft: upserted.skill,
        assistantMessage: `${upserted.created ? 'Created' : 'Updated'} skill "${upserted.skill.title}".`,
        llmProvider: 'manual',
        saved: true,
        created: upserted.created,
        skills: upserted.skills,
      }
    }

    const messages = this.normalizeSkillChatMessages(input.messages)
    const prompt = (input.prompt ?? '').trim()
    if (prompt) {
      messages.push({ role: 'user', content: prompt.slice(0, 4_000) })
    }
    if (messages.length === 0) {
      throw new BadRequestException('Provide either a prompt or at least one chat message.')
    }

    const settings = await this.users.getSettings(userId)
    let provider = this.normalizeProvider(settings.preferredProvider) ?? 'anthropic'
    let model = settings.preferredModel?.trim() || undefined

    let userLlmKey = await this.users.getRawLlmKey(userId, provider)
    let userApiKey = userLlmKey?.isActive ? (userLlmKey.apiKey ?? undefined) : undefined
    let userBaseUrl = userLlmKey?.isActive ? (userLlmKey.baseUrl ?? undefined) : undefined

    const systemPrompt = this.buildSkillBuilderSystemPrompt(allowedToolNames)

    const callLlm = async (targetProvider: LLMProvider) => {
      return this.llm.complete(
        messages,
        [],
        systemPrompt,
        targetProvider,
        userApiKey,
        userBaseUrl,
        model,
      )
    }

    let llmContent = ''
    try {
      llmContent = (await callLlm(provider)).content ?? ''
    } catch (error: any) {
      if (!this.shouldFallbackToOllama(provider, error)) throw error
      this.logger.warn(`Skill chat builder: provider ${provider} unavailable, falling back to ollama for user ${userId}.`)
      provider = 'ollama'
      model = undefined
      userLlmKey = await this.users.getRawLlmKey(userId, 'ollama')
      userApiKey = undefined
      userBaseUrl = userLlmKey?.isActive ? (userLlmKey.baseUrl ?? undefined) : undefined
      llmContent = (await callLlm(provider)).content ?? ''
    }

    const parsed = this.parseSkillBuilderOutput(llmContent)
    const fallbackSource = `${messages[messages.length - 1]?.content ?? ''}\n${llmContent}`.trim()
    const draft = this.normalizeSkillDraft(parsed ?? undefined, allowedToolNames)
      ?? this.buildFallbackSkillDraft(fallbackSource, allowedToolNames)

    if (saveRequested) {
      const upserted = await this.skills.upsertCustomSkill(userId, draft)
      return {
        draft: upserted.skill,
        assistantMessage: `${upserted.created ? 'Created' : 'Updated'} skill "${upserted.skill.title}".`,
        llmProvider: provider,
        saved: true,
        created: upserted.created,
        skills: upserted.skills,
      }
    }

    return {
      draft,
      assistantMessage: this.buildSkillDraftAssistantMessage(draft, parsed?.assistantMessage),
      llmProvider: provider,
      saved: false,
      created: false,
    }
  }

  updateConfig(patch: NanobotConfigPatch) {
    const next = this.config.updateRuntime(patch)
    this.bus.publish('run.event', {
      source: 'nanobot.config',
      patch,
    })
    return next
  }

  triggerCron(userId: string, jobName: string) {
    return this.cron.triggerNow(jobName, userId)
  }

  listPersonaProfiles() {
    return this.personality.listProfiles()
  }

  setPersonaProfile(userId: string, profileId: string) {
    return this.personality.setProfile(userId, profileId)
  }

  setPersonaBoundaries(userId: string, boundaries: string[]) {
    return this.personality.setBoundaries(userId, boundaries)
  }

  tickPresence(userId: string) {
    return this.presence.tick(userId, 'manual')
  }

  heartbeatTick(userId: string) {
    return this.heartbeat.tick(userId, 'manual')
  }

  listMarketplacePacks(userId: string) {
    return this.marketplace.listPacks(userId)
  }

  installMarketplacePack(userId: string, packId: string) {
    return this.marketplace.installPack(userId, packId)
  }

  exportMarketplacePack(userId: string, input: NanobotMarketplaceExportInput) {
    return this.marketplace.exportPack(userId, input)
  }

  verifyMarketplacePack(input: NanobotMarketplaceImportInput) {
    return this.marketplace.verifyPack(input)
  }

  importMarketplacePack(userId: string, input: NanobotMarketplaceImportInput) {
    return this.marketplace.importPack(userId, input)
  }

  listOrchestrationRuns(userId: string, limit?: number) {
    return this.orchestration.listForUser(userId, limit)
  }

  getOrchestrationRun(userId: string, runId: string) {
    return this.orchestration.getForUser(userId, runId)
  }

  listSpecialistRuns(userId: string, limit?: number) {
    return this.subagents.listSpecialistRuns(userId, limit)
  }

  createSpecialistRun(userId: string, input: CreateNanobotSpecialistRunInput) {
    return this.subagents.createSpecialistRun(userId, input)
  }

  runSpecialistRun(userId: string, runId: string, input: ExecuteNanobotSpecialistRunInput = {}) {
    return this.subagents.runSpecialist(userId, runId, input)
  }

  specialistRunStatus(userId: string, runId: string) {
    return this.subagents.getSpecialistStatus(userId, runId)
  }

  transcribeVoice(userId: string, input: NanobotVoiceTranscriptionInput) {
    this.bus.publish('voice.processed', { userId, action: 'transcribe' })
    return this.voice.transcribe(input)
  }

  speakVoice(userId: string, input: NanobotVoiceSynthesisInput) {
    this.bus.publish('voice.processed', { userId, action: 'speak' })
    return this.voice.synthesize(input)
  }

  getAutonomyWindows(userId: string) {
    return this.memory.getAutonomySchedule(userId)
  }

  updateAutonomyWindows(userId: string, input: UpdateNanobotAutonomyInput) {
    return this.memory.updateAutonomySchedule(userId, input)
  }

  getAutonomyStatus(userId: string) {
    return this.memory.getAutonomyStatus(userId)
  }

  curateMemory(userId: string) {
    return this.memory.curateNightly(userId, 'manual')
  }

  trustSnapshot(userId: string) {
    return this.trust.snapshot(userId)
  }

  cronHealth(userId: string, staleAfterMinutes?: number) {
    return this.cronService.health(userId, staleAfterMinutes)
  }

  cronSelfHeal(userId: string, input: CronSelfHealInput = {}) {
    return this.cronService.selfHeal(userId, input)
  }

  private normalizeProvider(rawProvider?: string | null): LLMProvider | null {
    const normalized = (rawProvider ?? '').trim().toLowerCase()
    if (
      normalized === 'anthropic'
      || normalized === 'openai'
      || normalized === 'google'
      || normalized === 'ollama'
      || normalized === 'minimax'
    ) {
      return normalized
    }
    return null
  }

  private shouldFallbackToOllama(provider: LLMProvider, error: unknown) {
    if (provider === 'ollama') return false
    const message = error instanceof Error ? error.message : String(error ?? '')
    return message.toLowerCase().includes('api key is not configured')
  }

  private normalizeSkillChatMessages(input: NanobotSkillChatInput['messages']) {
    if (!Array.isArray(input)) return []
    const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue
      const role = entry.role === 'assistant' ? 'assistant' : 'user'
      const content = typeof entry.content === 'string' ? entry.content.trim() : ''
      if (!content) continue
      out.push({ role, content: content.slice(0, 4_000) })
      if (out.length >= 24) break
    }
    return out
  }

  private buildSkillBuilderSystemPrompt(allowedToolNames: string[]) {
    const toolList = allowedToolNames.length > 0
      ? allowedToolNames.join(', ')
      : 'notes'

    return [
      'You are a skill composer for OpenAgents.',
      'Convert chat intent into one skill draft and return JSON only.',
      'Do not use markdown fences.',
      'Allowed tools:',
      toolList,
      'Return this exact JSON shape:',
      '{"title":"...","description":"...","tools":["..."],"promptAppendix":"...","assistantMessage":"...","id":"optional-custom-id"}',
      'Rules:',
      '- title: max 80 chars, concise.',
      '- description: max 280 chars, practical purpose.',
      '- tools: only from allowed tools, max 8 entries.',
      '- promptAppendix: actionable guidance the assistant should follow when this skill is active.',
      '- assistantMessage: short user-facing explanation of the draft.',
      '- If unsure, prefer tools ["notes"].',
    ].join('\n')
  }

  private parseSkillBuilderOutput(raw: string): (Partial<NanobotSkillDraftInput> & { assistantMessage?: string }) | null {
    const payload = raw.trim()
    if (!payload) return null

    const candidates: string[] = []
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) candidates.push(fenced[1].trim())
    const firstBrace = payload.indexOf('{')
    const lastBrace = payload.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(payload.slice(firstBrace, lastBrace + 1))
    }
    candidates.push(payload)

    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
        const record = parsed as Record<string, unknown>
        const tools = Array.isArray(record.tools)
          ? record.tools.filter((tool): tool is string => typeof tool === 'string')
          : []
        return {
          id: typeof record.id === 'string' ? record.id : undefined,
          title: typeof record.title === 'string' ? record.title : '',
          description: typeof record.description === 'string' ? record.description : '',
          tools,
          promptAppendix: typeof record.promptAppendix === 'string' ? record.promptAppendix : undefined,
          assistantMessage: typeof record.assistantMessage === 'string' ? record.assistantMessage : undefined,
        }
      } catch {
        // Continue searching candidates.
      }
    }

    return null
  }

  private normalizeSkillDraft(
    input: Partial<NanobotSkillDraftInput> | undefined,
    allowedToolNames: string[],
  ): NanobotSkillDraftInput | null {
    if (!input || typeof input !== 'object') return null

    const title = (input.title ?? '').trim().slice(0, 80)
    const description = (input.description ?? '').trim().slice(0, 280)
    if (!title || !description) return null

    const allowed = new Set(allowedToolNames)
    const normalizedTools: string[] = []
    for (const tool of Array.isArray(input.tools) ? input.tools : []) {
      const value = typeof tool === 'string' ? tool.trim() : ''
      if (!value || normalizedTools.includes(value)) continue
      if (allowed.size > 0 && !allowed.has(value)) continue
      normalizedTools.push(value)
      if (normalizedTools.length >= 8) break
    }

    const fallbackTool = allowed.has('notes')
      ? 'notes'
      : (allowedToolNames[0] ?? 'notes')

    const id = this.normalizeSkillId(input.id)
    const promptAppendix = (input.promptAppendix ?? '').trim().slice(0, 1000)

    return {
      ...(id ? { id } : {}),
      title,
      description,
      tools: normalizedTools.length > 0 ? normalizedTools : [fallbackTool],
      ...(promptAppendix ? { promptAppendix } : {}),
    }
  }

  private buildFallbackSkillDraft(sourceText: string, allowedToolNames: string[]): NanobotSkillDraftInput {
    const text = sourceText.replace(/\s+/g, ' ').trim()
    const seed = text || 'General assistant workflow'
    const titleSeed = seed
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .join(' ')
      .trim()
    const title = `${titleSeed || 'General'} Skill`.slice(0, 80)

    const allowed = new Set(allowedToolNames)
    const hintedTools = allowedToolNames.filter((name) => new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'i').test(seed))
    const fallbackTool = allowed.has('notes')
      ? 'notes'
      : (allowedToolNames[0] ?? 'notes')
    const tools = hintedTools.length > 0 ? hintedTools.slice(0, 4) : [fallbackTool]

    return {
      title,
      description: `User-defined skill generated from chat intent: ${seed.slice(0, 220)}`,
      tools,
      promptAppendix: `When this skill is active, follow the user objective about: ${seed.slice(0, 320)}.`,
    }
  }

  private buildSkillDraftAssistantMessage(draft: NanobotSkillDraftInput, suggested?: string) {
    const base = suggested?.trim()
    if (base) return base.slice(0, 320)
    return `Drafted "${draft.title}" with ${draft.tools.length} tool${draft.tools.length === 1 ? '' : 's'}. Review it and save when ready.`
  }

  private normalizeSkillId(raw: unknown) {
    if (typeof raw !== 'string') return ''
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
