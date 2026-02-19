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
import type { NanobotConfigPatch } from './types'

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
    private cron: NanobotCronService,
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
      personality,
      alive: this.alive.getForUser(userId),
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
}
