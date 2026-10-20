import type { OpenAgentsClient } from '../client'

export type PhoneCallStatus = 'pending_approval' | 'rejected' | 'dialing' | 'in_progress' | 'completed' | 'failed'

export interface PhoneTurn {
  role: 'caller' | 'agent'
  text: string
  at: string
}

export interface PhoneCall {
  id: string
  userId: string
  direction: 'outbound' | 'inbound'
  to: string
  from: string
  goal: string
  status: PhoneCallStatus
  twilioSid?: string
  transcript: PhoneTurn[]
  summary?: string
  error?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  endedAt?: string
}

export function createPhoneApi(client: OpenAgentsClient) {
  return {
    status: () => client.get<{ configured: boolean; from: string | null }>('/api/v1/phone/status'),
    list: () => client.get<PhoneCall[]>('/api/v1/phone/calls'),
    get: (id: string) => client.get<PhoneCall>(`/api/v1/phone/calls/${id}`),
    /** Queues the call; it is only dialed after approve(). */
    create: (to: string, goal: string) => client.post<PhoneCall>('/api/v1/phone/calls', { to, goal }),
    approve: (id: string) => client.post<PhoneCall>(`/api/v1/phone/calls/${id}/approve`),
    reject: (id: string) => client.post<PhoneCall>(`/api/v1/phone/calls/${id}/reject`),
  }
}
