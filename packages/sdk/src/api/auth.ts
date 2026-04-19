import type { OpenAgentsClient } from '../client'
import type { AuthTokens, User } from '@openagents/shared'

export interface LoginDto {
  email: string
  password: string
}

export interface RegisterDto {
  email: string
  password: string
  name?: string
}

export function createAuthApi(client: OpenAgentsClient) {
  return {
    login: (dto: LoginDto) =>
      client.post<{ user: User; tokens: AuthTokens }>('/api/v1/auth/login', dto),

    register: (dto: RegisterDto) =>
      client.post<{ user: User; tokens: AuthTokens }>('/api/v1/auth/register', dto),

    refresh: (refreshToken: string) =>
      client.post<AuthTokens>('/api/v1/auth/refresh', { refreshToken }),

    me: () => client.get<User>('/api/v1/auth/me'),

    logout: () => client.post<void>('/api/v1/auth/logout'),

    changePassword: (currentPassword: string, newPassword: string) =>
      client.post<{ message: string }>('/api/v1/auth/change-password', { currentPassword, newPassword }),

    forgotPassword: (email: string) =>
      client.post<{ message: string }>('/api/v1/auth/forgot-password', { email }),

    resetPassword: (token: string, newPassword: string) =>
      client.post<{ message: string }>('/api/v1/auth/reset-password', { token, newPassword }),
  }
}
