import { Injectable } from '@nestjs/common'
import { NanobotConfigService } from './config/nanobot-config.service'
import { NanobotSessionService } from './session/nanobot-session.service'
import { NanobotChannelsService } from './channels/nanobot-channels.service'
import { NanobotCliService } from './cli/nanobot-cli.service'

@Injectable()
export class NanobotService {
  constructor(
    private config: NanobotConfigService,
    private sessions: NanobotSessionService,
    private channels: NanobotChannelsService,
    private cli: NanobotCliService,
  ) {}

  health(userId: string) {
    return {
      config: this.config.toJSON(),
      activeSessions: this.sessions.listForUser(userId),
      channels: this.channels.listSupportedChannels(),
      cliHints: this.cli.commandHints(),
    }
  }
}

