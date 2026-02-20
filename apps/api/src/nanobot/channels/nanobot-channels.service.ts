import { Injectable } from '@nestjs/common'

@Injectable()
export class NanobotChannelsService {
  listSupportedChannels() {
    const hasTwilioCreds = Boolean(
      (process.env.TWILIO_ACCOUNT_SID ?? '').trim()
      && (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
      && (process.env.TWILIO_WHATSAPP_FROM ?? '').trim(),
    )
    const anyTwilioSet = Boolean(
      (process.env.TWILIO_ACCOUNT_SID ?? '').trim()
      || (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
      || (process.env.TWILIO_WHATSAPP_FROM ?? '').trim(),
    )
    const whatsappStatus = hasTwilioCreds ? 'enabled' : anyTwilioSet ? 'disabled' : 'planned'

    return [
      { id: 'web-chat', label: 'Web Chat', status: 'enabled' },
      { id: 'whatsapp', label: 'WhatsApp', status: whatsappStatus },
      { id: 'telegram', label: 'Telegram', status: 'planned' },
      { id: 'discord', label: 'Discord', status: 'planned' },
      { id: 'slack', label: 'Slack', status: 'planned' },
      { id: 'email', label: 'Email Inbox', status: 'planned' },
    ]
  }
}
