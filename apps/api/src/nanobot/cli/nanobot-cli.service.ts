import { Injectable } from '@nestjs/common'

@Injectable()
export class NanobotCliService {
  commandHints() {
    return [
      'openagents nanobot status',
      'openagents nanobot run --conversation <id>',
      'openagents nanobot cron trigger <job-name>',
      'openagents nanobot heartbeat tick',
    ]
  }
}

