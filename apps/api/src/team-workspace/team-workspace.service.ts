import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { randomUUID } from 'crypto'
import type { WorkspaceRole } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { hasWorkspaceRole, normalizeWorkspaceRole } from '../common/workspace-role'
import { KeyedLock } from '../common/keyed-lock'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { WorkspaceCollabService } from '../workspaces/workspace-collab.service'

const KIND = 'team-ws'
const ACTIVITY_CAP = 300
const MAX_RULES = 100
const MAX_SCOPES = 20
const MAX_ENTRIES_PER_SCOPE = 500

export type Risk = 'low' | 'medium' | 'high'
const RISK_ORDER: Record<Risk, number> = { low: 1, medium: 2, high: 3 }

/** The UI calls the editor role "member". Accept both on input. */
export function parseRole(raw: unknown): WorkspaceRole {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (v === 'member') return 'editor'
  if (v === 'owner' || v === 'admin' || v === 'editor' || v === 'viewer') return v
  throw new BadRequestException('Role must be one of owner, admin, member, viewer.')
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: 'Owner', admin: 'Admin', editor: 'Member', viewer: 'Viewer' }

export interface DelegationRule {
  id: string
  approverId: string
  /** A member userId or '*' for all members. */
  memberId: string
  /** Tool names or '*'. */
  tools: string[]
  maxRisk: Risk
  expiresAt: string | null
  createdBy: string
  createdAt: string
}

export interface MemoryScope {
  id: string
  name: string
  readRole: WorkspaceRole
  writeRole: WorkspaceRole
  builtin?: boolean
}

interface Policy {
  approvers: string[]
  rules: DelegationRule[]
  scopes: MemoryScope[]
}

export interface ScopeEntry {
  id: string
  title: string
  content: string
  tags: string[]
  authorId: string
  createdAt: string
}

export interface ActivityEntry {
  id: string
  at: string
  actorId: string
  action: string
  summary: string
  meta?: Record<string, unknown>
}

const defaultPolicy = (): Policy => ({
  approvers: [],
  rules: [],
  scopes: [
    { id: 'general', name: 'General', readRole: 'viewer', writeRole: 'editor', builtin: true },
    { id: 'admins', name: 'Admins only', readRole: 'admin', writeRole: 'admin', builtin: true },
  ],
})

@Injectable()
export class TeamWorkspaceService {
  private readonly lock = new KeyedLock()

  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentStore,
    private readonly workspaces: WorkspacesService,
    private readonly collab: WorkspaceCollabService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ── Access ────────────────────────────────────────────────────────────────

  private roleOf(row: { ownerId: string; members?: Array<{ userId: string; role: string }> }, userId: string): WorkspaceRole | null {
    if (row.ownerId === userId) return 'owner'
    const m = row.members?.find((x) => x.userId === userId)
    return m ? normalizeWorkspaceRole(m.role) : null
  }

  private async access(userId: string, workspaceId: string, min: WorkspaceRole) {
    const row = (await this.workspaces.requireWorkspace(userId, workspaceId, min)) as any
    return { row, ownerId: row.ownerId as string, role: this.roleOf(row, userId)! }
  }

  private async policy(ownerId: string, workspaceId: string): Promise<Policy> {
    const p = await this.docs.read<Policy>(ownerId, KIND, defaultPolicy, `policy:${workspaceId}`)
    const base = defaultPolicy()
    return {
      approvers: p.approvers ?? [],
      rules: p.rules ?? [],
      scopes: p.scopes?.length ? p.scopes : base.scopes,
    }
  }

  private mutatePolicy<T>(ownerId: string, workspaceId: string, fn: (p: Policy) => T | Promise<T>): Promise<T> {
    return this.lock.run(`policy:${workspaceId}`, async () => {
      const p = await this.policy(ownerId, workspaceId)
      const out = await fn(p)
      await this.docs.write(ownerId, KIND, p, `policy:${workspaceId}`)
      return out
    })
  }

  // ── Activity feed ─────────────────────────────────────────────────────────

  async record(ownerId: string, workspaceId: string, actorId: string, action: string, summary: string, meta?: Record<string, unknown>) {
    const key = `act:${workspaceId}`
    await this.lock.run(key, async () => {
      const list = await this.docs.read<ActivityEntry[]>(ownerId, KIND, () => [], key)
      list.unshift({ id: randomUUID(), at: new Date().toISOString(), actorId, action, summary: summary.slice(0, 300), meta })
      await this.docs.write(ownerId, KIND, list.slice(0, ACTIVITY_CAP), key)
    })
  }

  async activity(userId: string, workspaceId: string, limit = 100) {
    const { ownerId } = await this.access(userId, workspaceId, 'viewer')
    const list = await this.docs.read<ActivityEntry[]>(ownerId, KIND, () => [], `act:${workspaceId}`)
    const slice = list.slice(0, Math.min(Math.max(limit, 1), ACTIVITY_CAP))
    const names = await this.names([...new Set(slice.map((e) => e.actorId))])
    return slice.map((e) => ({ ...e, actorName: names.get(e.actorId) ?? 'Unknown' }))
  }

  private async names(ids: string[]) {
    if (!ids.length) return new Map<string, string>()
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    return new Map(users.map((u: any) => [u.id as string, (u.name || String(u.email).split('@')[0]) as string]))
  }

  // ── Overview, members, invites ────────────────────────────────────────────

  async overview(userId: string, workspaceId: string) {
    const { ownerId, role } = await this.access(userId, workspaceId, 'viewer')
    const ws = await this.workspaces.getForUser(userId, workspaceId)
    const policy = await this.policy(ownerId, workspaceId)
    const ids = [...new Set([ws.ownerId, ...ws.members.map((m) => m.userId)])]
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    const byId = new Map(users.map((u: any) => [u.id as string, u]))
    const isAdmin = hasWorkspaceRole(role, 'admin')
    const members = ids.map((id) => {
      const u: any = byId.get(id)
      const r = id === ws.ownerId ? 'owner' : normalizeWorkspaceRole(ws.members.find((m) => m.userId === id)?.role)
      return {
        userId: id,
        name: u?.name || (u?.email ? String(u.email).split('@')[0] : 'Unknown'),
        email: isAdmin ? u?.email ?? null : null,
        role: r,
        roleLabel: ROLE_LABELS[r],
        isApprover: policy.approvers.includes(id),
        you: id === userId,
      }
    })
    return {
      id: ws.id,
      name: ws.name,
      description: ws.description ?? null,
      yourRole: role,
      yourRoleLabel: ROLE_LABELS[role],
      members,
      invitations: isAdmin ? ws.invitations.filter((i) => i.status === 'pending') : [],
      settings: ws.settings,
      roles: (['owner', 'admin', 'editor', 'viewer'] as WorkspaceRole[]).map((r) => ({ role: r, label: ROLE_LABELS[r] })),
    }
  }

  async invite(userId: string, workspaceId: string, input: { email: string; role?: string; expiresInDays?: number }) {
    const role = input.role ? parseRole(input.role) : 'editor'
    if (role === 'owner') throw new BadRequestException('Cannot invite as owner.')
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    const inv = await this.workspaces.invite(userId, workspaceId, { email: input.email, role, expiresInDays: input.expiresInDays })
    await this.record(ownerId, workspaceId, userId, 'member.invited', `Invited ${input.email} as ${ROLE_LABELS[role]}`, { role })
    return inv
  }

  async changeRole(userId: string, workspaceId: string, memberUserId: string, rawRole: unknown) {
    const role = parseRole(rawRole)
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    const res = await this.collab.updateMemberRole(userId, workspaceId, memberUserId, role)
    if (role === 'viewer') {
      await this.mutatePolicy(ownerId, workspaceId, (p) => {
        p.approvers = p.approvers.filter((a) => a !== memberUserId)
        p.rules = p.rules.filter((r) => r.approverId !== memberUserId)
      })
    }
    await this.record(ownerId, workspaceId, userId, 'member.role_changed', `Changed a member's role to ${ROLE_LABELS[role]}`, { memberUserId, role })
    return res
  }

  async removeMember(userId: string, workspaceId: string, memberUserId: string) {
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    const res = await this.collab.removeMember(userId, workspaceId, memberUserId)
    await this.mutatePolicy(ownerId, workspaceId, (p) => {
      p.approvers = p.approvers.filter((a) => a !== memberUserId)
      p.rules = p.rules.filter((r) => r.approverId !== memberUserId && r.memberId !== memberUserId)
    })
    await this.record(ownerId, workspaceId, userId, 'member.removed', 'Removed a member', { memberUserId })
    return res
  }

  async revokeInvitation(userId: string, workspaceId: string, invitationId: string) {
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    const res = await this.collab.revokeInvitation(userId, workspaceId, invitationId)
    await this.record(ownerId, workspaceId, userId, 'invite.revoked', 'Revoked an invitation', { invitationId })
    return res
  }

  // ── Approver designation + delegation rules ───────────────────────────────

  async delegation(userId: string, workspaceId: string) {
    const { ownerId } = await this.access(userId, workspaceId, 'viewer')
    const p = await this.policy(ownerId, workspaceId)
    const names = await this.names([...new Set([...p.approvers, ...p.rules.map((r) => r.approverId), ...p.rules.map((r) => r.memberId).filter((m) => m !== '*')])])
    return {
      approvers: p.approvers.map((id) => ({ userId: id, name: names.get(id) ?? 'Unknown' })),
      rules: p.rules.map((r) => ({
        ...r,
        approverName: names.get(r.approverId) ?? 'Unknown',
        memberName: r.memberId === '*' ? 'All members' : names.get(r.memberId) ?? 'Unknown',
        expired: !!r.expiresAt && Date.parse(r.expiresAt) < Date.now(),
      })),
      explanation:
        'The workspace owner can approve on behalf of any member. Other approvers need to be designated here AND covered by a delegation rule (member, tools, max risk, optional expiry).',
    }
  }

  async setApprover(userId: string, workspaceId: string, targetUserId: string, on: boolean) {
    const { row, ownerId } = await this.access(userId, workspaceId, 'admin')
    const targetRole = this.roleOf(row, targetUserId)
    if (!targetRole) throw new NotFoundException('User is not a member of this workspace.')
    if (on && !hasWorkspaceRole(targetRole, 'editor')) throw new BadRequestException('Viewers cannot be approvers.')
    await this.mutatePolicy(ownerId, workspaceId, (p) => {
      p.approvers = on ? [...new Set([...p.approvers, targetUserId])] : p.approvers.filter((a) => a !== targetUserId)
      if (!on) p.rules = p.rules.filter((r) => r.approverId !== targetUserId)
    })
    await this.record(ownerId, workspaceId, userId, on ? 'approver.added' : 'approver.removed', `${on ? 'Designated' : 'Removed'} an approver`, { targetUserId })
    return this.delegation(userId, workspaceId)
  }

  async createRule(userId: string, workspaceId: string, input: { approverId: string; memberId?: string; tools?: string[]; maxRisk?: Risk; expiresInDays?: number }) {
    const { row, ownerId } = await this.access(userId, workspaceId, 'admin')
    const memberId = input.memberId && input.memberId !== '*' ? input.memberId : '*'
    if (memberId === input.approverId) throw new BadRequestException('An approver cannot be delegated their own approvals.')
    if (memberId !== '*' && !this.roleOf(row, memberId)) throw new BadRequestException('Member is not in this workspace.')
    const rule: DelegationRule = {
      id: randomUUID(),
      approverId: input.approverId,
      memberId,
      tools: input.tools?.length ? [...new Set(input.tools.map((t) => t.trim()).filter(Boolean))].slice(0, 50) : ['*'],
      maxRisk: input.maxRisk && RISK_ORDER[input.maxRisk] ? input.maxRisk : 'low',
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    }
    await this.mutatePolicy(ownerId, workspaceId, (p) => {
      if (!p.approvers.includes(rule.approverId)) throw new BadRequestException('Designate this user as an approver first.')
      if (!hasWorkspaceRole(this.roleOf(row, rule.approverId) ?? 'viewer', 'editor')) throw new BadRequestException('Approver must be at least a member.')
      if (p.rules.length >= MAX_RULES) throw new BadRequestException('Too many delegation rules.')
      p.rules.push(rule)
    })
    await this.record(ownerId, workspaceId, userId, 'delegation.created', `Delegation rule: approver may approve ${rule.tools.join(', ')} up to ${rule.maxRisk} risk`, { ruleId: rule.id, approverId: rule.approverId, memberId })
    return this.delegation(userId, workspaceId)
  }

  async deleteRule(userId: string, workspaceId: string, ruleId: string) {
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    await this.mutatePolicy(ownerId, workspaceId, (p) => {
      p.rules = p.rules.filter((r) => r.id !== ruleId)
    })
    await this.record(ownerId, workspaceId, userId, 'delegation.deleted', 'Removed a delegation rule', { ruleId })
    return this.delegation(userId, workspaceId)
  }

  private authorizes(policy: Policy, row: any, actorId: string, memberId: string, tool: string, risk: Risk): { ok: boolean; reason?: string } {
    if (actorId === memberId) return { ok: false, reason: 'Use the normal approvals flow for your own requests.' }
    const actorRole = this.roleOf(row, actorId)
    if (!actorRole || !hasWorkspaceRole(actorRole, 'editor')) return { ok: false, reason: 'Approver must be a workspace member (not viewer).' }
    if (actorRole === 'owner') return { ok: true }
    if (!policy.approvers.includes(actorId)) return { ok: false, reason: 'You are not a designated approver.' }
    const now = Date.now()
    const match = policy.rules.find(
      (r) =>
        r.approverId === actorId &&
        (r.memberId === '*' || r.memberId === memberId) &&
        (r.tools.includes('*') || r.tools.includes(tool)) &&
        RISK_ORDER[r.maxRisk] >= RISK_ORDER[risk] &&
        (!r.expiresAt || Date.parse(r.expiresAt) > now),
    )
    return match ? { ok: true } : { ok: false, reason: 'No delegation rule covers this member, tool and risk level.' }
  }

  private async approvalsService(): Promise<any> {
    const { ApprovalsService } = await import('../approvals/approvals.service')
    return this.moduleRef.get(ApprovalsService, { strict: false })
  }

  /** Pending approvals of workspace members that the caller may resolve on their behalf. */
  async delegatedPending(userId: string, workspaceId: string) {
    const { row, ownerId } = await this.access(userId, workspaceId, 'editor')
    const policy = await this.policy(ownerId, workspaceId)
    const approvals = await this.approvalsService()
    const memberIds = [...new Set([row.ownerId, ...(row.members ?? []).map((m: any) => m.userId)])].filter((id) => id !== userId).slice(0, 50) as string[]
    const names = await this.names(memberIds)
    const out: any[] = []
    for (const memberId of memberIds) {
      const pending: any[] = await approvals.list(memberId, 'pending').catch(() => [])
      for (const a of pending) {
        const risk: Risk = (a.risk?.level as Risk) ?? 'high'
        if (this.authorizes(policy, row, userId, memberId, a.toolName, risk).ok) {
          out.push({ id: a.id, ownerId: memberId, ownerName: names.get(memberId) ?? 'Unknown', toolName: a.toolName, risk: a.risk ?? null, createdAt: a.createdAt })
        }
      }
    }
    return out
  }

  async approveOnBehalf(userId: string, workspaceId: string, approvalId: string, approve: boolean, note?: string) {
    const { row, ownerId } = await this.access(userId, workspaceId, 'editor')
    const approval = await this.prisma.approval.findUnique({ where: { id: approvalId } })
    if (!approval) throw new NotFoundException('Approval not found.')
    if (approval.status !== 'pending') throw new BadRequestException('Approval is no longer pending.')
    const memberId = approval.userId
    if (!this.roleOf(row, memberId)) throw new ForbiddenException('That approval does not belong to a member of this workspace.')
    const approvals = await this.approvalsService()
    const view = (await approvals.list(memberId, 'pending')).find((a: any) => a.id === approvalId)
    const risk: Risk = (view?.risk?.level as Risk) ?? 'high'
    const policy = await this.policy(ownerId, workspaceId)
    const verdict = this.authorizes(policy, row, userId, memberId, approval.toolName, risk)
    if (!verdict.ok) throw new ForbiddenException(verdict.reason ?? 'Not authorized to approve on behalf.')
    const result = await approvals.resolve(approvalId, memberId, approve)
    await this.record(ownerId, workspaceId, userId, approve ? 'approval.delegated_approved' : 'approval.delegated_denied', `${approve ? 'Approved' : 'Denied'} ${approval.toolName} on behalf of a member (${risk} risk)`, {
      approvalId,
      onBehalfOf: memberId,
      tool: approval.toolName,
      risk,
      note: note?.slice(0, 300),
    })
    return { resolved: true, approved: approve, onBehalfOf: memberId, result }
  }

  // ── Shared memory scopes ──────────────────────────────────────────────────

  async scopes(userId: string, workspaceId: string) {
    const { ownerId, role } = await this.access(userId, workspaceId, 'viewer')
    const p = await this.policy(ownerId, workspaceId)
    return p.scopes.map((s) => ({ ...s, canRead: hasWorkspaceRole(role, s.readRole), canWrite: hasWorkspaceRole(role, s.writeRole) }))
  }

  async createScope(userId: string, workspaceId: string, input: { name: string; readRole?: string; writeRole?: string }) {
    const { ownerId } = await this.access(userId, workspaceId, 'admin')
    const readRole = input.readRole ? parseRole(input.readRole) : 'viewer'
    const writeRole = input.writeRole ? parseRole(input.writeRole) : 'editor'
    if (!hasWorkspaceRole(writeRole, readRole)) throw new BadRequestException('Write role must be at least as privileged as read role.')
    const id = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    if (!id) throw new BadRequestException('Invalid scope name.')
    await this.mutatePolicy(ownerId, workspaceId, (p) => {
      if (p.scopes.some((s) => s.id === id)) throw new BadRequestException('A scope with that name already exists.')
      if (p.scopes.length >= MAX_SCOPES) throw new BadRequestException('Too many scopes.')
      p.scopes.push({ id, name: input.name.trim().slice(0, 60), readRole, writeRole })
    })
    await this.record(ownerId, workspaceId, userId, 'scope.created', `Created memory scope "${input.name.trim().slice(0, 60)}"`, { scopeId: id })
    return this.scopes(userId, workspaceId)
  }

  private async requireScope(userId: string, workspaceId: string, scopeId: string, need: 'read' | 'write') {
    const ctx = await this.access(userId, workspaceId, 'viewer')
    const p = await this.policy(ctx.ownerId, workspaceId)
    const scope = p.scopes.find((s) => s.id === scopeId)
    if (!scope) throw new NotFoundException('Scope not found.')
    const min = need === 'read' ? scope.readRole : scope.writeRole
    if (!hasWorkspaceRole(ctx.role, min)) throw new ForbiddenException(`This scope requires ${min} access to ${need}.`)
    return { ...ctx, scope }
  }

  async listEntries(userId: string, workspaceId: string, scopeId: string) {
    const { ownerId } = await this.requireScope(userId, workspaceId, scopeId, 'read')
    const list = await this.docs.read<ScopeEntry[]>(ownerId, KIND, () => [], `mem:${workspaceId}:${scopeId}`)
    const names = await this.names([...new Set(list.map((e) => e.authorId))])
    return list.map((e) => ({ ...e, authorName: names.get(e.authorId) ?? 'Unknown' }))
  }

  async addEntry(userId: string, workspaceId: string, scopeId: string, input: { title: string; content: string; tags?: string[] }) {
    const { ownerId, scope } = await this.requireScope(userId, workspaceId, scopeId, 'write')
    const entry: ScopeEntry = {
      id: randomUUID(),
      title: input.title.trim().slice(0, 100),
      content: input.content.slice(0, 8000),
      tags: (input.tags ?? []).map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10),
      authorId: userId,
      createdAt: new Date().toISOString(),
    }
    const key = `mem:${workspaceId}:${scopeId}`
    await this.lock.run(key, async () => {
      const list = await this.docs.read<ScopeEntry[]>(ownerId, KIND, () => [], key)
      if (list.length >= MAX_ENTRIES_PER_SCOPE) throw new BadRequestException('Scope is full.')
      list.unshift(entry)
      await this.docs.write(ownerId, KIND, list, key)
    })
    await this.record(ownerId, workspaceId, userId, 'memory.added', `Added "${entry.title}" to ${scope.name}`, { scopeId, entryId: entry.id })
    return entry
  }

  async deleteEntry(userId: string, workspaceId: string, scopeId: string, entryId: string) {
    const { ownerId, role, scope } = await this.requireScope(userId, workspaceId, scopeId, 'write')
    const key = `mem:${workspaceId}:${scopeId}`
    await this.lock.run(key, async () => {
      const list = await this.docs.read<ScopeEntry[]>(ownerId, KIND, () => [], key)
      const target = list.find((e) => e.id === entryId)
      if (!target) throw new NotFoundException('Entry not found.')
      if (target.authorId !== userId && !hasWorkspaceRole(role, 'admin')) throw new ForbiddenException('Only the author or an admin can delete this entry.')
      await this.docs.write(ownerId, KIND, list.filter((e) => e.id !== entryId), key)
    })
    await this.record(ownerId, workspaceId, userId, 'memory.deleted', `Deleted an entry from ${scope.name}`, { scopeId, entryId })
    return { deleted: true }
  }
}
