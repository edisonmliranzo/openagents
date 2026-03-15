export type ChannelRuntimeStatus = 'enabled' | 'disabled' | 'planned'
export type WhatsAppDeviceSource = 'paired' | 'allowlisted'

export interface WhatsAppChannelHealth {
  configured: boolean
  twilioConfigured: boolean
  defaultRouteConfigured: boolean
  webhookTokenEnabled: boolean
  allowlistEnforced: boolean
  legacyDefaultRouteEnabled: boolean
}

export type WhatsAppPairingStatus = 'pending' | 'linked' | 'expired' | 'canceled'

export interface WhatsAppPairingSession {
  id: string
  code: string
  command: string
  status: WhatsAppPairingStatus
  phone: string | null
  expiresAt: string
  linkedAt: string | null
  linkText: string
  linkUrl: string | null
  qrImageUrl: string | null
}

export interface WhatsAppDeviceLink {
  id: string
  phone: string
  label: string | null
  source: WhatsAppDeviceSource
  linkedAt: string
  updatedAt: string
  lastSeenAt: string | null
  lastConversationId: string | null
}

export interface CreateWhatsAppPairingInput {
  expiresInMinutes?: number
}

export interface AllowWhatsAppDeviceInput {
  phone: string
  label?: string
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export interface TelegramChannelHealth {
  configured: boolean
  webhookSecretEnabled: boolean
}

export type TelegramPairingStatus = 'pending' | 'linked' | 'expired' | 'canceled'

export interface TelegramChatLink {
  id: string
  chatId: string
  label: string | null
  linkedAt: string
  updatedAt: string
  lastSeenAt: string | null
  lastConversationId: string | null
}

export interface TelegramPairingSession {
  id: string
  code: string
  command: string
  status: TelegramPairingStatus
  chatId: string | null
  expiresAt: string
  linkedAt: string | null
}

export interface CreateTelegramPairingInput {
  expiresInMinutes?: number
}

export interface RegisterTelegramWebhookInput {
  webhookUrl: string
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export interface SlackChannelHealth {
  configured: boolean
  signingSecretEnabled: boolean
}

export type SlackPairingStatus = 'pending' | 'linked' | 'expired' | 'canceled'

export interface SlackWorkspaceLink {
  id: string
  teamId: string
  teamName: string | null
  channelId: string | null
  linkedAt: string
  updatedAt: string
  lastSeenAt: string | null
  lastConversationId: string | null
}

export interface SlackPairingSession {
  id: string
  code: string
  command: string
  status: SlackPairingStatus
  teamId: string | null
  expiresAt: string
  linkedAt: string | null
}

export interface CreateSlackPairingInput {
  expiresInMinutes?: number
}

// ─── Discord ──────────────────────────────────────────────────────────────────

export interface DiscordChannelHealth {
  configured: boolean
  publicKeyEnabled: boolean
}

export type DiscordPairingStatus = 'pending' | 'linked' | 'expired' | 'canceled'

export interface DiscordServerLink {
  id: string
  guildId: string
  guildName: string | null
  channelId: string | null
  linkedAt: string
  updatedAt: string
  lastSeenAt: string | null
  lastConversationId: string | null
}

export interface DiscordPairingSession {
  id: string
  code: string
  command: string
  status: DiscordPairingStatus
  guildId: string | null
  expiresAt: string
  linkedAt: string | null
}

export interface CreateDiscordPairingInput {
  expiresInMinutes?: number
}
