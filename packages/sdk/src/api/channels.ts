import type { OpenAgentsClient } from '../client'
import type {
  AllowWhatsAppDeviceInput,
  CreateWhatsAppPairingInput,
  WhatsAppChannelHealth,
  WhatsAppDeviceLink,
  WhatsAppPairingSession,
  TelegramChannelHealth,
  TelegramChatLink,
  TelegramPairingSession,
  CreateTelegramPairingInput,
  RegisterTelegramWebhookInput,
  SlackChannelHealth,
  SlackWorkspaceLink,
  SlackPairingSession,
  CreateSlackPairingInput,
  DiscordChannelHealth,
  DiscordServerLink,
  DiscordPairingSession,
  CreateDiscordPairingInput,
} from '@openagents/shared'

export function createChannelsApi(client: OpenAgentsClient) {
  return {
    // ─── WhatsApp ────────────────────────────────────────────────────────────
    whatsappHealth: () => client.get<WhatsAppChannelHealth>('/api/v1/channels/whatsapp/health'),
    listWhatsAppDevices: () => client.get<WhatsAppDeviceLink[]>('/api/v1/channels/whatsapp/devices'),
    allowWhatsAppDevice: (input: AllowWhatsAppDeviceInput) =>
      client.post<WhatsAppDeviceLink>('/api/v1/channels/whatsapp/devices/allowlist', input),
    unlinkWhatsAppDevice: (deviceId: string) =>
      client.delete<void>(`/api/v1/channels/whatsapp/devices/${deviceId}`),
    listWhatsAppPairings: () =>
      client.get<WhatsAppPairingSession[]>('/api/v1/channels/whatsapp/pairings'),
    createWhatsAppPairing: (input: CreateWhatsAppPairingInput = {}) =>
      client.post<WhatsAppPairingSession>('/api/v1/channels/whatsapp/pairings', input),

    // ─── Telegram ────────────────────────────────────────────────────────────
    telegramHealth: () => client.get<TelegramChannelHealth>('/api/v1/channels/telegram/health'),
    listTelegramChats: () => client.get<TelegramChatLink[]>('/api/v1/channels/telegram/chats'),
    unlinkTelegramChat: (chatId: string) =>
      client.delete<void>(`/api/v1/channels/telegram/chats/${chatId}`),
    listTelegramPairings: () =>
      client.get<TelegramPairingSession[]>('/api/v1/channels/telegram/pairings'),
    createTelegramPairing: (input: CreateTelegramPairingInput = {}) =>
      client.post<TelegramPairingSession>('/api/v1/channels/telegram/pairings', input),
    registerTelegramWebhook: (input: RegisterTelegramWebhookInput) =>
      client.post<{ ok: boolean; description?: string }>('/api/v1/channels/telegram/webhook/register', input),

    // ─── Slack ────────────────────────────────────────────────────────────────
    slackHealth: () => client.get<SlackChannelHealth>('/api/v1/channels/slack/health'),
    listSlackWorkspaces: () => client.get<SlackWorkspaceLink[]>('/api/v1/channels/slack/workspaces'),
    unlinkSlackWorkspace: (workspaceId: string) =>
      client.delete<void>(`/api/v1/channels/slack/workspaces/${workspaceId}`),
    listSlackPairings: () =>
      client.get<SlackPairingSession[]>('/api/v1/channels/slack/pairings'),
    createSlackPairing: (input: CreateSlackPairingInput = {}) =>
      client.post<SlackPairingSession>('/api/v1/channels/slack/pairings', input),

    // ─── Discord ──────────────────────────────────────────────────────────────
    discordHealth: () => client.get<DiscordChannelHealth>('/api/v1/channels/discord/health'),
    listDiscordServers: () => client.get<DiscordServerLink[]>('/api/v1/channels/discord/servers'),
    unlinkDiscordServer: (serverId: string) =>
      client.delete<void>(`/api/v1/channels/discord/servers/${serverId}`),
    listDiscordPairings: () =>
      client.get<DiscordPairingSession[]>('/api/v1/channels/discord/pairings'),
    createDiscordPairing: (input: CreateDiscordPairingInput = {}) =>
      client.post<DiscordPairingSession>('/api/v1/channels/discord/pairings', input),
  }
}
