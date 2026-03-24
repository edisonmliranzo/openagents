import type { WorkspaceRole } from '@openagents/shared'

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

export function normalizeWorkspaceRole(raw: unknown): WorkspaceRole {
  if (typeof raw !== 'string') return 'viewer'
  const value = raw.trim().toLowerCase()
  if (value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer') {
    return value
  }
  return 'viewer'
}

export function hasWorkspaceRole(current: WorkspaceRole, minimum: WorkspaceRole) {
  return ROLE_ORDER[current] >= ROLE_ORDER[minimum]
}

export function buildWorkspacePermissions(role: WorkspaceRole) {
  if (role === 'owner') return ['workspace:manage', 'members:manage', 'content:write', 'content:read']
  if (role === 'admin') return ['members:manage', 'content:write', 'content:read']
  if (role === 'editor') return ['content:write', 'content:read']
  return ['content:read']
}
