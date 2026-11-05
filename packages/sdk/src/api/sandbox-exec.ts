import type { OpenAgentsClient } from '../client'

export type SandboxLanguage = 'sh' | 'node' | 'python'
export type SandboxMode = 'docker' | 'restricted'

export interface SandboxRunRequest {
  language: SandboxLanguage
  code: string
  timeoutMs?: number
  memoryMb?: number
  cpus?: number
  network?: boolean
  isolation?: 'auto' | 'docker' | 'restricted'
}

export interface SandboxRunResult {
  id: string
  language: SandboxLanguage
  codePreview: string
  mode: SandboxMode
  fallbackReason?: string
  network: boolean
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
  stdout: string
  stderr: string
  durationMs: number
  limits: { timeoutMs: number; memoryMb: number; cpus: number; outputBytes: number }
  at: string
}

export interface SandboxStatus {
  docker: { available: boolean; version: string | null }
  images: Record<string, { image: string; present: boolean }>
  defaults: { timeoutMs: number; memoryMb: number; cpus: number; outputBytes: number }
  preferredMode: SandboxMode
}

export function createSandboxExecApi(client: OpenAgentsClient) {
  return {
    status: () => client.get<SandboxStatus>('/api/v1/sandbox-exec/status'),
    run: (body: SandboxRunRequest) => client.post<SandboxRunResult>('/api/v1/sandbox-exec/run', body),
    history: () => client.get<SandboxRunResult[]>('/api/v1/sandbox-exec/history'),
    clearHistory: () => client.delete<{ ok: boolean }>('/api/v1/sandbox-exec/history'),
  }
}
