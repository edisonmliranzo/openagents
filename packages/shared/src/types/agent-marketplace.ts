// Agent marketplace types
export interface AgentListing {
  id: string
  userId: string
  agentId: string
  name: string
  description: string
  version: string
  category: string
  tags: string[]
  screenshots: string[]
  demoUrl?: string
  isFeatured: boolean
  isVerified: boolean
  installCount: number
  rating: number
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentListingVersion {
  id: string
  listingId: string
  version: string
  changelog: string
  config: Record<string, unknown>
  dependencies: string[]
  compatibility: CompatibilityInfo
  downloadCount: number
  createdAt: string
}

export interface CompatibilityInfo {
  minPlatformVersion: string
  requiredTools: string[]
  requiredConnectors: string[]
  warnings: string[]
}

export interface AgentReview {
  id: string
  listingId: string
  userId: string
  version: string
  rating: number
  title: string
  content: string
  pros: string[]
  cons: string[]
  useCases: string[]
  helpfulCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentDependency {
  id: string
  listingId: string
  dependencyId: string
  versionRange: string
  isRequired: boolean
}

export interface AgentInstall {
  id: string
  userId: string
  listingId: string
  version: string
  installedConfig: Record<string, unknown>
  workspaceId?: string
  status: 'installing' | 'installed' | 'failed' | 'uninstalled'
  error?: string
  createdAt: string
}
