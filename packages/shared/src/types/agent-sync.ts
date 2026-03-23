// Cross-platform agent sync types
export interface AgentSync {
  id: string
  userId: string
  deviceId: string
  syncType: 'full' | 'incremental' | 'realtime'
  status: 'pending' | 'syncing' | 'completed' | 'failed'
  changes: SyncChange[]
  lastSyncedAt: string
  createdAt: string
}

export interface SyncChange {
  id: string
  entityType: 'conversation' | 'memory' | 'settings' | 'workflow' | 'context'
  entityId: string
  changeType: 'create' | 'update' | 'delete'
  data: Record<string, unknown>
  deviceId: string
  timestamp: string
}

export interface SyncConflict {
  id: string
  userId: string
  entityType: string
  entityId: string
  localVersion: Record<string, unknown>
  remoteVersion: Record<string, unknown>
  resolution: 'local' | 'remote' | 'merged' | 'pending'
  createdAt: string
  resolvedAt?: string
}

export interface DeviceSession {
  id: string
  userId: string
  deviceId: string
  deviceType: 'web' | 'mobile' | 'desktop'
  lastActiveAt: string
  syncEnabled: boolean
  preferences: DevicePreferences
}

export interface DevicePreferences {
  notificationsEnabled: boolean
  offlineMode: boolean
  autoSync: boolean
  syncFrequency: 'realtime' | 'hourly' | 'daily' | 'manual'
}
