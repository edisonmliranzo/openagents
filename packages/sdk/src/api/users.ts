import type { OpenAgentsClient } from '../client'
import type { User, UserSettings, UpdateSettingsDto, LlmApiKey, UpsertLlmKeyDto } from '@openagents/shared'

export interface UpdateProfileDto {
  name?: string
  avatarUrl?: string
}

export function createUsersApi(client: OpenAgentsClient) {
  return {
    getProfile: () =>
      client.get<User>('/api/v1/users/me'),

    updateProfile: (dto: UpdateProfileDto) =>
      client.put<User>('/api/v1/users/me', dto),

    getSettings: () =>
      client.get<UserSettings>('/api/v1/users/me/settings'),

    updateSettings: (dto: UpdateSettingsDto) =>
      client.put<UserSettings>('/api/v1/users/me/settings', dto),

    getLlmKeys: () =>
      client.get<LlmApiKey[]>('/api/v1/users/me/llm-keys'),

    upsertLlmKey: (provider: string, dto: UpsertLlmKeyDto) =>
      client.put<LlmApiKey>(`/api/v1/users/me/llm-keys/${provider}`, dto),

    deleteLlmKey: (provider: string) =>
      client.delete<void>(`/api/v1/users/me/llm-keys/${provider}`),
  }
}
