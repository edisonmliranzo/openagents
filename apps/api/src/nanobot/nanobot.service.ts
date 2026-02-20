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
import { NanobotPresenceService } from './agent/nanobot-presence.service'
import { NanobotMarketplaceService } from './marketplace/nanobot-marketplace.service'
import { NanobotTrustService } from './trust/nanobot-trust.service'
import { CronService } from '../cron/cron.service'
import type { NanobotConfigPatch, NanobotMarketplaceExportInput } from './types'
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
    private cron: NanobotCronService,
    private presence: NanobotPresenceService,
    private marketplace: NanobotMarketplaceService,
    private trust: NanobotTrustService,
    private cronService: CronService,
  ) {}

  async health(userId: string) {
    const [activeSkills, personality] = await Promise.all([
      this.skills.listForUser(userId),
      this.personality.getForUser(userId),
    ])

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

  listMarketplacePacks(userId: string) {
    return this.marketplace.listPacks(userId)
  }

  installMarketplacePack(userId: string, packId: string) {
    return this.marketplace.installPack(userId, packId)
  }

  exportMarketplacePack(userId: string, input: NanobotMarketplaceExportInput) {
    return this.marketplace.exportPack(userId, input)
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
