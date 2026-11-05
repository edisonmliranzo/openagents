import type { OpenAgentsClient } from '../client'

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type TeamRisk = 'low' | 'medium' | 'high'

export interface TeamMemberRow {
  userId: string
  name: string
  email: string | null
  role: TeamRole
  roleLabel: string
  isApprover: boolean
  you: boolean
}

export interface TeamOverview {
  id: string
  name: string
  description: string | null
  yourRole: TeamRole
  yourRoleLabel: string
  members: TeamMemberRow[]
  invitations: Array<{ id: string; email: string; role: TeamRole; status: string; expiresAt: string }>
  settings: Record<string, unknown>
  roles: Array<{ role: TeamRole; label: string }>
}

export interface TeamDelegationRule {
  id: string
  approverId: string
  approverName: string
  memberId: string
  memberName: string
  tools: string[]
  maxRisk: TeamRisk
  expiresAt: string | null
  expired: boolean
  createdAt: string
}

export interface TeamDelegation {
  approvers: Array<{ userId: string; name: string }>
  rules: TeamDelegationRule[]
  explanation: string
}

export interface TeamMemoryScope {
  id: string
  name: string
  readRole: TeamRole
  writeRole: TeamRole
  builtin?: boolean
  canRead: boolean
  canWrite: boolean
}

export interface TeamMemoryEntry {
  id: string
  title: string
  content: string
  tags: string[]
  authorId: string
  authorName: string
  createdAt: string
}

export interface TeamActivityEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  summary: string
  meta?: Record<string, unknown>
}

export interface TeamPendingApproval {
  id: string
  ownerId: string
  ownerName: string
  toolName: string
  risk: { level: TeamRisk; score: number; reason: string } | null
  createdAt: string
}

const base = (id: string) => `/api/v1/team-workspaces/${encodeURIComponent(id)}`

export function createTeamWorkspaceApi(client: OpenAgentsClient) {
  return {
    overview: (id: string) => client.get<TeamOverview>(`${base(id)}/overview`),
    invite: (id: string, input: { email: string; role?: 'admin' | 'member' | 'viewer'; expiresInDays?: number }) =>
      client.post<unknown>(`${base(id)}/invites`, input),
    revokeInvite: (id: string, invitationId: string) => client.delete<unknown>(`${base(id)}/invites/${encodeURIComponent(invitationId)}`),
    changeRole: (id: string, userId: string, role: 'admin' | 'member' | 'viewer') =>
      client.patch<unknown>(`${base(id)}/members/${encodeURIComponent(userId)}/role`, { role }),
    removeMember: (id: string, userId: string) => client.delete<unknown>(`${base(id)}/members/${encodeURIComponent(userId)}`),
    activity: (id: string, limit = 100) => client.get<TeamActivityEntry[]>(`${base(id)}/activity?limit=${limit}`),
    delegation: (id: string) => client.get<TeamDelegation>(`${base(id)}/delegation`),
    addApprover: (id: string, userId: string) => client.put<TeamDelegation>(`${base(id)}/approvers/${encodeURIComponent(userId)}`),
    removeApprover: (id: string, userId: string) => client.delete<TeamDelegation>(`${base(id)}/approvers/${encodeURIComponent(userId)}`),
    createRule: (id: string, input: { approverId: string; memberId?: string; tools?: string[]; maxRisk?: TeamRisk; expiresInDays?: number }) =>
      client.post<TeamDelegation>(`${base(id)}/delegation/rules`, input),
    deleteRule: (id: string, ruleId: string) => client.delete<TeamDelegation>(`${base(id)}/delegation/rules/${encodeURIComponent(ruleId)}`),
    pendingApprovals: (id: string) => client.get<TeamPendingApproval[]>(`${base(id)}/delegation/pending`),
    approveOnBehalf: (id: string, approvalId: string, approve: boolean, note?: string) =>
      client.post<{ resolved: boolean }>(`${base(id)}/delegation/approvals/${encodeURIComponent(approvalId)}`, { approve, note }),
    scopes: (id: string) => client.get<TeamMemoryScope[]>(`${base(id)}/scopes`),
    createScope: (id: string, input: { name: string; readRole?: 'admin' | 'member' | 'viewer'; writeRole?: 'admin' | 'member' | 'viewer' }) =>
      client.post<TeamMemoryScope[]>(`${base(id)}/scopes`, input),
    entries: (id: string, scopeId: string) => client.get<TeamMemoryEntry[]>(`${base(id)}/scopes/${encodeURIComponent(scopeId)}/entries`),
    addEntry: (id: string, scopeId: string, input: { title: string; content: string; tags?: string[] }) =>
      client.post<TeamMemoryEntry>(`${base(id)}/scopes/${encodeURIComponent(scopeId)}/entries`, input),
    deleteEntry: (id: string, scopeId: string, entryId: string) =>
      client.delete<{ deleted: boolean }>(`${base(id)}/scopes/${encodeURIComponent(scopeId)}/entries/${encodeURIComponent(entryId)}`),
  }
}
