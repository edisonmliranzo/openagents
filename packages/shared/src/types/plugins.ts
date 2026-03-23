// Plugin architecture types
export interface Plugin {
  id: string
  name: string
  version: string
  displayName: string
  description: string
  author: string
  category: 'tool' | 'connector' | 'template' | 'theme'
  repository?: string
  npmPackage?: string
  manifest: PluginManifest
  isVerified: boolean
  isFeatured: boolean
  installCount: number
  rating: number
  createdAt: string
  updatedAt: string
}

export interface PluginManifest {
  name: string
  version: string
  entryPoint: string
  permissions: string[]
  dependencies: Record<string, string>
  environment: 'browser' | 'server' | 'both'
  apis: string[]
}

export interface PluginInstall {
  id: string
  pluginId: string
  userId: string
  version: string
  status: 'installing' | 'installed' | 'failed' | 'uninstalled'
  config: Record<string, unknown>
  error?: string
  createdAt: string
}

export interface PluginPermission {
  id: string
  name: string
  description: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  requiresApproval: boolean
}

export interface PluginReview {
  id: string
  pluginId: string
  userId: string
  rating: number
  content: string
  version: string
  createdAt: string
}

export interface PluginVersion {
  id: string
  pluginId: string
  version: string
  changelog: string
  manifest: PluginManifest
  downloadUrl: string
  size: number
  createdAt: string
}
