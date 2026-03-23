// Collaboration types for multi-user workspaces
export interface Workspace {
  id: string
  name: string
  description: string
  ownerId: string
  members: WorkspaceMember[]
  settings: WorkspaceSettings
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  userId: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  joinedAt: string
  permissions: string[]
}

export interface WorkspaceSettings {
  allowMemberInvites: boolean
  requireApprovalForNewMembers: boolean
  defaultMemberRole: string
  sharedMemoryEnabled: boolean
  sharedAgentsEnabled: boolean
}

export interface WorkspaceChange {
  id: string
  workspaceId: string
  userId: string
  entityType: 'agent' | 'memory' | 'workflow' | 'settings'
  entityId: string
  changeType: 'create' | 'update' | 'delete'
  previousValue?: Record<string, unknown>
  newValue: Record<string, unknown>
  message?: string
  timestamp: string
}

export interface WorkspaceInvitation {
  id: string
  workspaceId: string
  email: string
  role: string
  invitedBy: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
}

export interface PresenceInfo {
  userId: string
  workspaceId: string
  lastActiveAt: string
  currentEntity?: {
    type: string
    id: string
    name: string
  }
  cursor?: {
    line: number
    column: number
  }
}
