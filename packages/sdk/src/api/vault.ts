import type { OpenAgentsClient } from '../client'

export interface VaultSecret {
  id: string
  name: string
  scope: string
  /** Non-secret context. The value is never returned. */
  hint?: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

const BASE = '/api/v1/vault'

export function createVaultApi(client: OpenAgentsClient) {
  return {
    list: (scope?: string) =>
      client.get<VaultSecret[]>(scope ? `${BASE}?scope=${encodeURIComponent(scope)}` : BASE),

    /**
     * Stores a secret. There is deliberately no way to read the value back —
     * the agent uses it by name and the server resolves it.
     */
    put: (input: { name: string; scope?: string; value: string; hint?: string }) =>
      client.post<VaultSecret>(BASE, input),

    remove: (id: string) => client.delete<{ ok: boolean }>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
