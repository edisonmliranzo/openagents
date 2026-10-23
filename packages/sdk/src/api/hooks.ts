import type { OpenAgentsClient } from '../client'
import type { HookDefinition, HookEvent } from '@openagents/shared'

const BASE = '/api/v1/hooks'

export function createHooksApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<HookDefinition[]>(BASE),

    create: (input: {
      name: string
      event: HookEvent
      condition?: HookDefinition['condition']
      action: HookDefinition['action']
      enabled?: boolean
      order?: number
    }) => client.post<HookDefinition>(BASE, input),

    update: (id: string, patch: Partial<Pick<HookDefinition, 'name' | 'enabled' | 'condition' | 'action' | 'order'>>) =>
      client.patch<HookDefinition>(`${BASE}/${encodeURIComponent(id)}`, patch),

    remove: (id: string) => client.delete<{ ok: boolean }>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
