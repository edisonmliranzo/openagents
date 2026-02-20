import type { OpenAgentsClient } from '../client'
import type {
  CreateWhatsAppPairingInput,
  WhatsAppChannelHealth,
  WhatsAppDeviceLink,
  WhatsAppPairingSession,
} from '@openagents/shared'

export function createChannelsApi(client: OpenAgentsClient) {
  return {
    whatsappHealth: () => client.get<WhatsAppChannelHealth>('/api/v1/channels/whatsapp/health'),
    listWhatsAppDevices: () => client.get<WhatsAppDeviceLink[]>('/api/v1/channels/whatsapp/devices'),
    unlinkWhatsAppDevice: (deviceId: string) =>
      client.delete<void>(`/api/v1/channels/whatsapp/devices/${deviceId}`),
    listWhatsAppPairings: () =>
      client.get<WhatsAppPairingSession[]>('/api/v1/channels/whatsapp/pairings'),
    createWhatsAppPairing: (input: CreateWhatsAppPairingInput = {}) =>
      client.post<WhatsAppPairingSession>('/api/v1/channels/whatsapp/pairings', input),
  }
}
