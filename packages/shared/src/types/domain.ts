export type UserDomainStatus = 'pending' | 'active' | 'error'
export type UserDomainProvider = 'manual' | 'cloudflare' | 'caddy' | 'nginx'

export interface UserDomain {
  id: string
  userId: string
  domain: string
  status: UserDomainStatus
  provider: UserDomainProvider
  targetHost: string | null
  proxyInstructions: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateUserDomainDto {
  domain: string
  provider?: UserDomainProvider
  status?: UserDomainStatus
  targetHost?: string | null
  proxyInstructions?: string | null
}

export interface UpdateUserDomainDto {
  provider?: UserDomainProvider
  status?: UserDomainStatus
  targetHost?: string | null
  proxyInstructions?: string | null
}
