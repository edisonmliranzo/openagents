// Project management integration types
export interface ProjectSync {
  id: string
  userId: string
  provider: 'jira' | 'linear' | 'notion' | 'asana' | 'trello'
  config: ProjectConfig
  status: 'connected' | 'syncing' | 'error' | 'disconnected'
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectConfig {
  accessToken: string
  refreshToken?: string
  workspaceId: string
  projectId?: string
  webhookSecret?: string
  autoSync: boolean
  syncDirection: 'bidirectional' | 'to_project' | 'from_project'
}

export interface ProjectTask {
  id: string
  externalId: string
  provider: string
  title: string
  description?: string
  status: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  assignee?: string
  dueDate?: string
  labels: string[]
  url: string
  createdAt: string
  updatedAt: string
}

export interface SyncMapping {
  id: string
  syncId: string
  entityType: 'task' | 'comment' | 'attachment'
  localEntityId: string
  remoteEntityId: string
  lastSyncedAt: string
  syncDirection: 'local_to_remote' | 'remote_to_local' | 'bidirectional'
}

export interface CreateTaskRequest {
  provider: string
  title: string
  description?: string
  status?: string
  priority?: string
  assigneeEmail?: string
  dueDate?: string
  labels?: string[]
  projectId?: string
}
