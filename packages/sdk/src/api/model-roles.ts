import type { OpenAgentsClient } from '../client'
import type { ModelRole } from '@openagents/shared'

export interface ModelRoleSettings {
  roles: Partial<Record<ModelRole, string>>
  defaults: Record<ModelRole, string>
  available: string[]
}

const BASE = '/api/v1/model-roles'

export function createModelRolesApi(client: OpenAgentsClient) {
  return {
    get: () => client.get<ModelRoleSettings>(BASE),

    /** Pins a model to a kind of work (chat, artifact, scheduled, subagent, background). */
    set: (roles: Partial<Record<ModelRole, string>>) =>
      client.post<{ roles: Partial<Record<ModelRole, string>> }>(BASE, roles),
  }
}
