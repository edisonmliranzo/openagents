import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AgentService } from '../../agent/agent.service'
import { NanobotConfigService } from '../config/nanobot-config.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import { NanobotSessionService } from '../session/nanobot-session.service'
import { NanobotContextService } from './nanobot-context.service'
import { NanobotSkillsRegistry } from './nanobot-skills.registry'
import { NanobotSubagentService } from './nanobot-subagent.service'
import { NanobotBuiltinToolsService } from './tools/nanobot-builtin-tools.service'
import type { NanobotRunParams } from '../types'

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
    private subagents: NanobotSubagentService,
    private tools: NanobotBuiltinToolsService,
  ) {}

  async run(params: NanobotRunParams) {
    const runId = randomUUID()
    this.sessions.touch(params.conversationId, params.userId)
    this.bus.publish('run.started', {
      runId,
      userId: params.userId,
      conversationId: params.conversationId,
      runtime: this.config.runtimeLabel,
    })

    try {
      params.emit('status', {
        status: 'thinking',
        runtime: this.config.runtimeLabel,
        runId,
      })

      const activeSkills = await this.skills.getActiveForUser(params.userId)
      const availableTools = await this.tools.list(params.userId)
      const prompt = await this.context.buildSystemPrompt(params.userId, activeSkills)

      this.bus.publish('context.built', {
        runId,
        skillCount: activeSkills.length,
        toolCount: availableTools.length,
        promptLength: prompt.length,
        maxLoopSteps: this.config.maxLoopSteps,
      })

      this.subagents.spawn(params.userId, 'nanobot-telemetry')

      if (this.config.shadowMode) {
        params.emit('status', {
          status: 'thinking',
          runtime: this.config.runtimeLabel,
          shadowMode: true,
        })
      }

      await this.agent.run({
        ...params,
        emit: (event, data) => {
          this.bus.publish('run.event', { runId, event })
          params.emit(event, data)
        },
      })

      this.sessions.setStatus(params.conversationId, 'done')
      this.bus.publish('run.completed', {
        runId,
        userId: params.userId,
        conversationId: params.conversationId,
      })
    } catch (error: any) {
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
}

