import type { NanobotRuntimeConfig, NanobotSkillState } from './nanobot'

export interface AgentVersionSettingsSnapshot {
  preferredProvider?: string
  preferredModel?: string
  customSystemPrompt?: string
}

export interface AgentVersionSnapshot {
  id: string
  userId: string
  version: number
  createdAt: string
  note?: string
  settings: AgentVersionSettingsSnapshot
  runtimeConfig: NanobotRuntimeConfig
  skills: NanobotSkillState[]
}

export interface CreateAgentVersionInput {
  note?: string
}

export interface AgentVersionDiffEntry {
  path: string
  before?: string
  after?: string
}

export interface AgentVersionDiffResult {
  fromId: string
  toId: string
  changes: AgentVersionDiffEntry[]
}

export interface AgentVersionRollbackResult {
  ok: true
  restoredVersionId: string
  currentSnapshot: AgentVersionSnapshot
}
