import type { OpenAgentsClient } from '../client'
import type {
  User,
  UserSettings,
  UpdateSettingsDto,
  LlmApiKey,
  UpsertLlmKeyDto,
  UserDomain,
  CreateUserDomainDto,
  UpdateUserDomainDto,
} from '@openagents/shared'

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

    listDomains: () =>
      client.get<UserDomain[]>('/api/v1/users/me/domains'),

    createDomain: (dto: CreateUserDomainDto) =>
      client.post<UserDomain>('/api/v1/users/me/domains', dto),

    updateDomain: (id: string, dto: UpdateUserDomainDto) =>
      client.patch<UserDomain>(`/api/v1/users/me/domains/${id}`, dto),

    deleteDomain: (id: string) =>
      client.delete<{ ok: true }>(`/api/v1/users/me/domains/${id}`),
  }
}
