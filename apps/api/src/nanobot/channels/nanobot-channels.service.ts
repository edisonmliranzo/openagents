import { Injectable } from '@nestjs/common'

@Injectable()
export class NanobotChannelsService {
  listSupportedChannels() {
    const whatsappStatus = this.resolveStatus([
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_WHATSAPP_FROM',
    ])
    const telegramStatus = this.resolveStatus(['TELEGRAM_BOT_TOKEN'])
    const discordStatus = this.resolveStatus(['DISCORD_BOT_TOKEN'])
    const slackStatus = this.resolveStatus(['SLACK_BOT_TOKEN'])

    return [
      { id: 'web-chat', label: 'Web Chat', status: 'enabled' },
      { id: 'whatsapp', label: 'WhatsApp', status: whatsappStatus },
      { id: 'telegram', label: 'Telegram', status: telegramStatus },
      { id: 'discord', label: 'Discord', status: discordStatus },
      { id: 'slack', label: 'Slack', status: slackStatus },
      { id: 'email', label: 'Email Inbox', status: 'planned' },
    ]
  }

  private resolveStatus(requiredEnvVars: string[]) {
    const values = requiredEnvVars.map((name) => (process.env[name] ?? '').trim())
    const allSet = values.every(Boolean)
    const anySet = values.some(Boolean)
    if (allSet) return 'enabled'
    if (anySet) return 'disabled'
    return 'planned'
  }
}
