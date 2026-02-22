import type { NanobotRuntimeConfig, NanobotSkillState } from './nanobot'

export interface AgentVersionSnapshot {
  id: string
  userId: string
  version: number
  note: string | null
  createdAt: string
  settings: {
    preferredProvider: string
    preferredModel: string
    customSystemPrompt: string | null
  }
  runtimeConfig: NanobotRuntimeConfig
  skills: NanobotSkillState[]
}

export interface AgentVersionDiffEntry {
  path: string
  before: string | null
  after: string | null
}

export interface AgentVersionDiffResult {
  fromId: string
  toId: string
  changes: AgentVersionDiffEntry[]
}

export interface CreateAgentVersionInput {
  note?: string
}
