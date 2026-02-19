export interface AuditLog {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
}
