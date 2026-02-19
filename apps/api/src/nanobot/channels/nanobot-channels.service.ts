import { Injectable } from '@nestjs/common'

@Injectable()
export class NanobotChannelsService {
  listSupportedChannels() {
    return [
      { id: 'web-chat', label: 'Web Chat', status: 'enabled' },
      { id: 'whatsapp', label: 'WhatsApp', status: 'planned' },
      { id: 'telegram', label: 'Telegram', status: 'planned' },
      { id: 'discord', label: 'Discord', status: 'planned' },
      { id: 'slack', label: 'Slack', status: 'planned' },
      { id: 'email', label: 'Email Inbox', status: 'planned' },
    ]
  }
}
