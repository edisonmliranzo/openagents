export const API_VERSION = 'v1'
export const API_BASE = `/api/${API_VERSION}`

export const LLM_MODELS = {
  anthropic: {
    default: 'claude-sonnet-4-6',
    fast: 'claude-haiku-4-5-20251001',
    powerful: 'claude-opus-4-6',
  },
  openai: {
    default: 'gpt-4o',
    fast: 'gpt-4o-mini',
    powerful: 'gpt-4o',
  },
  ollama: {
    default: 'llama3.2',
    fast: 'phi3',
    powerful: 'codellama',
  },
} as const

export const LLM_MODEL_OPTIONS = {
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  ollama: ['llama3.2', 'mistral', 'codellama', 'neural-chat', 'phi3'],
} as const

export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const SHORT_TERM_MEMORY_LIMIT = 20 // last N messages for context

export const QUEUE_NAMES = {
  approvals: 'approvals',
  toolRuns: 'tool-runs',
} as const

export const APPROVAL_JOB_NAMES = {
  resolved: 'approval.resolved',
} as const
