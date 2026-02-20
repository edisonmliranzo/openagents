export type ChannelRuntimeStatus = 'enabled' | 'disabled' | 'planned'

export interface WhatsAppChannelHealth {
  configured: boolean
  twilioConfigured: boolean
  defaultRouteConfigured: boolean
  webhookTokenEnabled: boolean
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
  linkedAt: string
  updatedAt: string
  lastSeenAt: string | null
  lastConversationId: string | null
}

export interface CreateWhatsAppPairingInput {
  expiresInMinutes?: number
}
