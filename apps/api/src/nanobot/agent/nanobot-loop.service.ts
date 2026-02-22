import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AgentService } from '../../agent/agent.service'
import { NanobotConfigService } from '../config/nanobot-config.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import { NanobotSessionService } from '../session/nanobot-session.service'
import { NanobotContextService } from './nanobot-context.service'
import { NanobotSkillsRegistry } from './nanobot-skills.registry'
import { NanobotPersonalityService } from './nanobot-personality.service'
import { NanobotRoleEngineService } from './nanobot-role-engine.service'
import { NanobotAliveStateService } from './nanobot-alive-state.service'
import { NanobotSubagentService } from './nanobot-subagent.service'
import { NanobotOrchestrationService } from './nanobot-orchestration.service'
import { NanobotBuiltinToolsService } from './tools/nanobot-builtin-tools.service'
import { NanobotRuntimeIntelligenceService } from './nanobot-runtime-intelligence.service'
import { PrismaService } from '../../prisma/prisma.service'
import { SkillReputationService } from '../../skill-reputation/skill-reputation.service'
import type { NanobotRunParams } from '../types'

interface ParsedSkillCommand {
  matched: boolean
  title?: string
  description?: string
  promptAppendix?: string
  tools?: string[]
  error?: string
}

@Injectable()
export class NanobotLoopService {
  private readonly logger = new Logger(NanobotLoopService.name)

  constructor(
    private agent: AgentService,
    private config: NanobotConfigService,
    private bus: NanobotBusService,
    private sessions: NanobotSessionService,
    private context: NanobotContextService,
    private skills: NanobotSkillsRegistry,
    private personality: NanobotPersonalityService,
    private roles: NanobotRoleEngineService,
    private alive: NanobotAliveStateService,
    private subagents: NanobotSubagentService,
    private orchestration: NanobotOrchestrationService,
    private tools: NanobotBuiltinToolsService,
    private runtimeIntelligence: NanobotRuntimeIntelligenceService,
    private prisma: PrismaService,
    private skillReputation: SkillReputationService,
  ) {}

  async run(params: NanobotRunParams) {
    const runId = randomUUID()
    let activeSkillIds: string[] = []
    this.sessions.touch(params.conversationId, params.userId)
    this.bus.publish('run.started', {
      runId,
      userId: params.userId,
      conversationId: params.conversationId,
      runtime: this.config.runtimeLabel,
    })

    const skillCommand = this.parseSkillCommand(params.userMessage)
    if (skillCommand.matched) {
      try {
        await this.handleSkillCommand(params, runId, skillCommand)
        return
      } catch (error: any) {
        this.sessions.setStatus(params.conversationId, 'failed')
        this.bus.publish('run.failed', {
          runId,
          userId: params.userId,
          conversationId: params.conversationId,
          error: error?.message ?? 'Unknown error',
          skillCommand: true,
        })
        this.logger.error('Nanobot skill command failed', error)
        throw error
      }
    }

    try {
      let latestAgentReply = ''
      const route = this.runtimeIntelligence.routeThinking(params.userMessage)
      this.runtimeIntelligence.recordThinkingRoute(params.userId, route)

      const basePersonalityState = await this.personality.getForUser(params.userId)
      const personaDecision = this.runtimeIntelligence.decidePersonaSwitch({
        userId: params.userId,
        route,
        currentPersonality: basePersonalityState,
      })

      const personalityState = personaDecision.switched
        ? await this.personality.setProfile(params.userId, personaDecision.nextProfileId)
        : basePersonalityState

      this.runtimeIntelligence.recordPersonaDecision(params.userId, {
        switched: personaDecision.switched,
        fromProfileId: basePersonalityState.profileId,
        toProfileId: personalityState.profileId,
        reason: personaDecision.reason,
        taskType: personaDecision.taskType,
      })

      if (personaDecision.switched) {
        this.bus.publish('run.event', {
          source: 'nanobot.persona.auto',
          runId,
          userId: params.userId,
          from: basePersonalityState.profileId,
          to: personalityState.profileId,
          reason: personaDecision.reason,
          taskType: personaDecision.taskType,
        })
      }

      const roleDecision = this.roles.evaluate(params.userMessage, personalityState, route)
      const aliveState = this.alive.patchForUser(params.userId, {
        activeGoal: roleDecision.plannerGoal,
        thoughtMode: roleDecision.thoughtMode,
        taskType: roleDecision.taskType,
        thinkingDepth: roleDecision.thinkingDepth,
        urgency: roleDecision.urgency,
        confidence: roleDecision.confidence,
        intentionQueue: roleDecision.plannerPlan,
        waitingReason: 'thinking',
        lastRoleDecision: roleDecision,
      })
      const orchestration = this.orchestration.startRun({
        runId,
        userId: params.userId,
        conversationId: params.conversationId,
        decision: roleDecision,
      })

      params.emit('status', {
        status: 'thinking',
        runtime: this.config.runtimeLabel,
        runId,
        alive: aliveState,
        personality: personalityState,
        orchestration,
      })

      const activeSkills = await this.skills.getActiveForUser(params.userId)
      activeSkillIds = activeSkills.map((skill) => skill.id)
      const availableTools = await this.tools.list(params.userId)
      const prompt = await this.context.buildSystemPrompt(params.userId, activeSkills)
      const rolePrompt = this.roles.buildPromptAppendix(roleDecision)
      const personalityPrompt = this.personality.buildPromptAppendix(personalityState)
      const systemPromptAppendix = `${personalityPrompt}\n\n${rolePrompt}`

      this.bus.publish('context.built', {
        runId,
        skillCount: activeSkills.length,
        toolCount: availableTools.length,
        promptLength: prompt.length,
        maxLoopSteps: this.config.maxLoopSteps,
        thoughtMode: roleDecision.thoughtMode,
        thinkingDepth: roleDecision.thinkingDepth,
        complexity: roleDecision.complexity,
        urgency: roleDecision.urgency,
        confidence: roleDecision.confidence,
      })

      this.bus.publish('run.event', {
        source: 'nanobot.roles',
        runId,
        userId: params.userId,
        conversationId: params.conversationId,
        plannerGoal: roleDecision.plannerGoal,
        confidence: roleDecision.confidence,
        thoughtMode: roleDecision.thoughtMode,
        thinkingDepth: roleDecision.thinkingDepth,
        complexity: roleDecision.complexity,
        urgency: roleDecision.urgency,
        taskType: roleDecision.taskType,
      })

      this.subagents.spawnRoleCrew(params.userId, runId, roleDecision)
      this.subagents.spawn(params.userId, 'nanobot-telemetry', 'telemetry', runId)
      this.orchestration.markPlanningComplete(runId)
      this.bus.publish('orchestration.updated', { runId, stage: 'executing' })

      if (this.config.shadowMode) {
        const shadowState = this.alive.patchForUser(params.userId, {
          waitingReason: 'shadow mode simulation',
        })
        params.emit('status', {
          status: 'thinking',
          runtime: this.config.runtimeLabel,
          shadowMode: true,
          alive: shadowState,
        })
      }

      await this.agent.run({
        ...params,
        systemPromptAppendix,
        emit: (event, data: any) => {
          if (event === 'message' && data?.role === 'agent' && typeof data?.content === 'string') {
            latestAgentReply = data.content
          }
          if (event === 'tool_result') {
            const toolName = typeof data?.tool === 'string' ? data.tool : 'tool'
            const success = Boolean(data?.result?.success)
            this.orchestration.addToolEvent(runId, toolName, success ? 'ok' : 'error')
            this.bus.publish('orchestration.updated', { runId, stage: 'executing', tool: toolName, success })
          }
          if (event === 'status') {
            const status = typeof data?.status === 'string' ? data.status : ''
            if (status === 'running_tool') {
              const toolName = typeof data?.tool === 'string' ? data.tool : 'tool'
              const nextAlive = this.alive.markWaiting(params.userId, `running ${toolName}`, 'act')
              this.bus.publish('run.event', { runId, event, tool: toolName })
              params.emit(event, { ...data, alive: nextAlive })
              return
            }
            if (status === 'thinking') {
              const nextAlive = this.alive.patchForUser(params.userId, {
                waitingReason: 'thinking',
                thoughtMode: roleDecision.thoughtMode,
                taskType: roleDecision.taskType,
                thinkingDepth: roleDecision.thinkingDepth,
                urgency: roleDecision.urgency,
              })
              this.bus.publish('run.event', { runId, event })
              params.emit(event, { ...data, alive: nextAlive })
              return
            }
            if (status === 'done') {
              const nextAlive = this.alive.markDone(params.userId)
              this.orchestration.markReviewing(runId)
              this.bus.publish('run.event', { runId, event })
              params.emit(event, { ...data, alive: nextAlive })
              return
            }
          }
          this.bus.publish('run.event', { runId, event })
          params.emit(event, data)
        },
      })

      const recentToolCount = await this.countRecentRunTools(params.conversationId)
      await this.personality.updateForTurn(params.userId, {
        userMessage: params.userMessage,
        success: true,
        hadTools: recentToolCount > 0,
        toolCount: recentToolCount,
      })

      const learnedSkill = await this.autoExtractSkillFromRecentTools(params.userId, params.conversationId)
      if (learnedSkill) {
        this.bus.publish('run.event', {
          source: 'nanobot.skills.auto',
          runId,
          userId: params.userId,
          conversationId: params.conversationId,
          skillId: learnedSkill.skillId,
          sequence: learnedSkill.sequence,
          occurrences: learnedSkill.occurrences,
        })
      }
      this.orchestration.completeRun(
        runId,
        latestAgentReply.trim() ? latestAgentReply.trim().slice(0, 800) : 'Run completed.',
      )
      if (activeSkillIds.length > 0) {
        await this.skillReputation.record({
          userId: params.userId,
          skillIds: activeSkillIds,
          success: true,
          source: 'nanobot.run',
          runId,
          conversationId: params.conversationId,
        })
      }
      this.bus.publish('orchestration.updated', { runId, stage: 'done' })

      this.sessions.setStatus(params.conversationId, 'done')
      this.bus.publish('run.completed', {
        runId,
        userId: params.userId,
        conversationId: params.conversationId,
      })
    } catch (error: any) {
      await this.personality.updateForTurn(params.userId, {
        userMessage: params.userMessage,
        success: false,
      }).catch(() => {})
      this.alive.patchForUser(params.userId, {
        waitingReason: error?.message ?? 'run failed',
        thoughtMode: 'reflect',
        taskType: 'general',
        thinkingDepth: 'balanced',
        urgency: 'normal',
      })
      this.orchestration.failRun(runId, error?.message ?? 'Run failed')
      if (activeSkillIds.length > 0) {
        await this.skillReputation.record({
          userId: params.userId,
          skillIds: activeSkillIds,
          success: false,
          source: 'nanobot.run',
          runId,
          conversationId: params.conversationId,
        }).catch(() => {})
      }
      this.bus.publish('orchestration.updated', { runId, stage: 'error', error: error?.message ?? 'Run failed' })
      this.sessions.setStatus(params.conversationId, 'failed')
      this.bus.publish('run.failed', {
        runId,
        userId: params.userId,
        conversationId: params.conversationId,
        error: error?.message ?? 'Unknown error',
      })
      this.logger.error('Nanobot loop failed', error)
      throw error
    }
  }

  private async handleSkillCommand(params: NanobotRunParams, runId: string, command: ParsedSkillCommand) {
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: 'user',
        content: params.userMessage,
        status: 'done',
      },
    })
    params.emit('message', userMsg)

    let reply = ''
    if (command.error) {
      reply = [
        command.error,
        'Use one of these formats:',
        '/skill {"title":"name","description":"what it does","promptAppendix":"guidance","tools":["notes"]}',
        '/skill Title | Description | Prompt guidance | tools=notes,web_search',
      ].join('\n')
    } else {
      const upserted = await this.skills.upsertCustomSkill(params.userId, {
        title: command.title!,
        description: command.description,
        promptAppendix: command.promptAppendix,
        tools: command.tools,
      })

      reply = [
        `${upserted.created ? 'Learned' : 'Updated'} skill "${upserted.skill.title}" (${upserted.skill.id}).`,
        `Description: ${upserted.skill.description}`,
        `Tools: ${upserted.skill.tools.join(', ')}`,
        upserted.skill.promptAppendix
          ? `Prompt guidance: ${upserted.skill.promptAppendix}`
          : 'Prompt guidance: (none)',
      ].join('\n')

      this.bus.publish('run.event', {
        source: 'nanobot.skills',
        userId: params.userId,
        conversationId: params.conversationId,
        action: upserted.created ? 'created' : 'updated',
        skillId: upserted.skill.id,
      })
    }

    const agentMsg = await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: 'agent',
        content: reply,
        status: 'done',
      },
    })
    params.emit('message', agentMsg)

    await this.prisma.conversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: new Date() },
    })

    await this.personality.updateForTurn(params.userId, {
      userMessage: params.userMessage,
      success: !command.error,
      hadTools: false,
      toolCount: 0,
    }).catch(() => {})
    this.alive.patchForUser(params.userId, {
      activeGoal: command.title ? `Maintain skill ${command.title}` : 'Process skill command',
      thoughtMode: 'reflect',
      taskType: 'general',
      thinkingDepth: 'balanced',
      urgency: 'normal',
      confidence: command.error ? 0.35 : 0.82,
      intentionQueue: command.error ? ['Fix command format and retry'] : ['Skill persisted and enabled'],
      waitingReason: null,
    })

    params.emit('status', {
      status: 'done',
      runtime: this.config.runtimeLabel,
      runId,
      skillCommand: true,
    })
    this.sessions.setStatus(params.conversationId, 'done')
    this.bus.publish('run.completed', {
      runId,
      userId: params.userId,
      conversationId: params.conversationId,
      skillCommand: true,
    })
  }

  private async countRecentRunTools(conversationId: string) {
    const since = new Date(Date.now() - 5 * 60 * 1000)
    const count = await this.prisma.message.count({
      where: {
        conversationId,
        role: 'tool',
        status: 'done',
        createdAt: { gte: since },
      },
    })
    return count
  }

  private async autoExtractSkillFromRecentTools(userId: string, conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        role: 'tool',
        status: 'done',
        conversation: { userId },
      },
      orderBy: { createdAt: 'desc' },
      take: 180,
      select: {
        toolCallJson: true,
        createdAt: true,
      },
    })

    if (messages.length < 10) return null

    const names = messages
      .reverse()
      .map((message) => this.parseToolName(message.toolCallJson))
      .filter((value): value is string => Boolean(value))

    if (names.length < 8) return null

    const counts = new Map<string, number>()
    for (let len = 2; len <= 4; len += 1) {
      for (let idx = 0; idx <= names.length - len; idx += 1) {
        const sequence = names.slice(idx, idx + len)
        if (new Set(sequence).size === 1 && len === 2) continue
        const key = sequence.join('>')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }

    const ranked = [...counts.entries()]
      .filter((entry) => entry[1] >= 3)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    if (!ranked.length) return null

    const [bestKey, occurrences] = ranked[0]
    const sequence = bestKey.split('>').map((value) => value.trim()).filter(Boolean)
    if (sequence.length < 2) return null

    const idBase = `custom-flow-${sequence.join('-').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`.slice(0, 64)
    const existingSkills = await this.skills.listForUser(userId)
    if (existingSkills.some((skill) => skill.id === idBase)) return null

    const title = `Auto Flow: ${sequence.join(' -> ')}`.slice(0, 80)
    const description = `Auto-learned from repeated tool sequence in recent runs (${occurrences} occurrences).`
    const promptAppendix = `If the task resembles prior repeated flows, prefer this sequence: ${sequence.join(' -> ')}.`
    await this.skills.upsertCustomSkill(userId, {
      id: idBase,
      title,
      description,
      tools: [...new Set(sequence)],
      promptAppendix,
    })

    this.alive.patchForUser(userId, {
      waitingReason: null,
      intentionQueue: [`Learned auto-skill ${idBase}`],
    })

    return {
      skillId: idBase,
      sequence,
      occurrences,
      conversationId,
    }
  }

  private parseToolName(raw: string | null) {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { name?: unknown }
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
      return name || null
    } catch {
      return null
    }
  }

  private parseSkillCommand(userMessage: string): ParsedSkillCommand {
    const trimmed = userMessage.trim()
    if (!trimmed) return { matched: false }

    const topicMatch = trimmed.match(/^learn\s+skills?\s+(?:of|about|for)\s+([\s\S]+)$/i)
    if (topicMatch?.[1]) {
      return this.buildTopicSkillCommand(topicMatch[1])
    }

    const prefixPatterns = [
      /^\/skill\s+([\s\S]+)$/i,
      /^learn\s+skill\s*:\s*([\s\S]+)$/i,
      /^teach\s+skill\s*:\s*([\s\S]+)$/i,
    ]

    let payload = ''
    for (const pattern of prefixPatterns) {
      const match = trimmed.match(pattern)
      if (match?.[1]) {
        payload = match[1].trim()
        break
      }
    }

    if (!payload) return { matched: false }
    if (!payload.trim()) {
      return { matched: true, error: 'Skill command is empty.' }
    }

    if (payload.startsWith('{')) {
      try {
        const parsed = JSON.parse(payload) as {
          title?: unknown
          description?: unknown
          promptAppendix?: unknown
          tools?: unknown
        }
        const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
        if (!title) return { matched: true, error: 'Skill title is required.' }

        const tools = Array.isArray(parsed.tools)
          ? parsed.tools.filter((tool): tool is string => typeof tool === 'string')
          : undefined
        const description = typeof parsed.description === 'string' ? parsed.description : undefined
        const promptAppendix = typeof parsed.promptAppendix === 'string' ? parsed.promptAppendix : undefined

        return {
          matched: true,
          title,
          description,
          promptAppendix,
          tools,
        }
      } catch {
        return { matched: true, error: 'Invalid JSON for /skill command.' }
      }
    }

    const lineMap = new Map<string, string>()
    const lines = payload.split('\n').map((line) => line.trim()).filter(Boolean)
    for (const line of lines) {
      const idx = line.indexOf(':')
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim().toLowerCase()
      const value = line.slice(idx + 1).trim()
      if (!key || !value) continue
      lineMap.set(key, value)
    }

    if (lineMap.has('title')) {
      const title = lineMap.get('title') ?? ''
      if (!title) return { matched: true, error: 'Skill title is required.' }
      const description = lineMap.get('description') ?? lineMap.get('desc')
      const promptAppendix = lineMap.get('promptappendix') ?? lineMap.get('prompt') ?? lineMap.get('guidance')
      const toolsText = lineMap.get('tools') ?? lineMap.get('tool')
      return {
        matched: true,
        title,
        description,
        promptAppendix,
        tools: this.parseTools(toolsText),
      }
    }

    const pipeParts = payload.split('|').map((part) => part.trim()).filter(Boolean)
    if (pipeParts.length < 2) {
      return {
        matched: true,
        error: 'Skill command needs at least title and description.',
      }
    }

    const toolsSegment = pipeParts.find((part) => /^tools?\s*=/i.test(part))
    const title = pipeParts[0]
    const description = pipeParts[1]
    const promptAppendix = pipeParts.length > 2 && !/^tools?\s*=/i.test(pipeParts[2]) ? pipeParts[2] : undefined
    const toolsText = toolsSegment ? toolsSegment.replace(/^tools?\s*=/i, '').trim() : undefined

    return {
      matched: true,
      title,
      description,
      promptAppendix,
      tools: this.parseTools(toolsText),
    }
  }

  private parseTools(raw: string | undefined) {
    if (!raw) return undefined
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  private buildTopicSkillCommand(topicRaw: string): ParsedSkillCommand {
    const topic = topicRaw.trim().replace(/[.!?]+$/, '')
    if (!topic) {
      return { matched: true, error: 'Skill topic is required.' }
    }

    const normalized = topic.toLowerCase()
    const tools = new Set<string>(['notes'])

    if (/(bybit|futures|perp|perpetual)/i.test(normalized)) {
      tools.add('bybit_get_ticker')
      tools.add('bybit_get_positions')
      tools.add('bybit_get_wallet_balance')
      tools.add('bybit_place_demo_order')
    }
    if (/(binance|crypto|bitcoin|eth|trading|market)/i.test(normalized)) {
      tools.add('web_search')
      tools.add('web_fetch')
    } else if (/(code|programming|typescript|javascript|python|debug|fix|build)/i.test(normalized)) {
      tools.add('web_fetch')
    } else if (/(research|news|latest|analysis)/i.test(normalized)) {
      tools.add('web_search')
      tools.add('web_fetch')
    }

    const title = `${topic.slice(0, 56)} Skill`
    const description = `Topic skill for ${topic}. Use curated tools and produce actionable output.`
    const promptAppendix = [
      `When the request is about ${topic}, prefer this skill workflow:`,
      '1. Clarify objective and constraints.',
      '2. Gather relevant facts using allowed tools.',
      '3. Return a concise plan or answer with concrete next actions.',
    ].join('\n')

    return {
      matched: true,
      title,
      description,
      promptAppendix,
      tools: [...tools],
    }
  }
}
