import type { OpenAgentsClient } from '../client'

export interface SpecialistAgentRow {
  id: string
  userId: string
  name: string
  role: string
  personaPrompt: string
  emailAlias: string | null
  telegramToken?: string | null
  monthlyBudgetUsd: number
  spentUsd: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export function createSpecialistsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<SpecialistAgentRow[]>('/api/v1/specialists'),
    create: (input: { name: string; role?: string; personaPrompt?: string; emailAlias?: string; telegramToken?: string; monthlyBudgetUsd?: number }) =>
      client.post<SpecialistAgentRow>('/api/v1/specialists', input),
    update: (id: string, input: Partial<{ name: string; role: string; personaPrompt: string; emailAlias: string; telegramToken: string; monthlyBudgetUsd: number; enabled: boolean }>) =>
      client.patch<SpecialistAgentRow>(`/api/v1/specialists/${id}`, input),
    remove: (id: string) => client.delete<{ ok: true }>(`/api/v1/specialists/${id}`),
  }
}
