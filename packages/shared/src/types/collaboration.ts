export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface WorkspaceSettings {
  allowMemberInvites: boolean
  requireApprovalForNewMembers: boolean
  defaultMemberRole: WorkspaceRole
  sharedMemoryEnabled: boolean
  sharedAgentsEnabled: boolean
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  permissions: string[]
  invitedByUserId?: string
  joinedAt: string
}

export interface WorkspaceInvitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  createdAt: string
  updatedAt: string
}

export interface WorkspaceConversationShare {
  id: string
  workspaceId: string
  conversationId: string
  title: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceWorkflowShare {
  id: string
  workspaceId: string
  workflowId: string
  name: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceArtifactShare {
  id: string
  workspaceId: string
  artifactId: string
  title: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceMemoryEntry {
  id: string
  workspaceId: string
  createdByUserId: string
  type: 'fact' | 'summary' | 'note'
  title: string
  content: string
  tags: string[]
  sourceRef?: string
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  ownerId: string
  members: WorkspaceMember[]
  invitations: WorkspaceInvitation[]
  conversations: WorkspaceConversationShare[]
  workflows: WorkspaceWorkflowShare[]
  artifacts: WorkspaceArtifactShare[]
  memory: WorkspaceMemoryEntry[]
  settings: WorkspaceSettings
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface UpdateWorkspaceInput {
  name?: string
  description?: string | null
  settings?: Partial<WorkspaceSettings>
}

export interface CreateWorkspaceInvitationInput {
  email: string
  role?: WorkspaceRole
  expiresInDays?: number
}

export interface CreateWorkspaceMemoryEntryInput {
  type?: 'fact' | 'summary' | 'note'
  title: string
  content: string
  tags?: string[]
  sourceRef?: string
}

export interface WorkspaceChange {
  id: string
  workspaceId: string
  userId: string
  entityType: 'agent' | 'artifact' | 'memory' | 'workflow' | 'settings'
  entityId: string
  changeType: 'create' | 'update' | 'delete' | 'share'
  previousValue?: Record<string, unknown>
  newValue: Record<string, unknown>
  message?: string
  timestamp: string
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
