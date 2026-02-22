import { Injectable } from '@nestjs/common'
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
import type {
  NanobotConfigPatch,
  NanobotMarketplaceExportInput,
  NanobotMarketplaceImportInput,
  NanobotVoiceSynthesisInput,
  NanobotVoiceTranscriptionInput,
  UpdateNanobotAutonomyInput,
} from './types'
import type { CronSelfHealInput } from '@openagents/shared'

@Injectable()
export class NanobotService {
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
}
