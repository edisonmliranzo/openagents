export const API_VERSION = 'v1'
export const API_BASE = `/api/${API_VERSION}`

export const LLM_MODELS = {
  anthropic: {
    default: 'claude-sonnet-4-6',
    fast: 'claude-haiku-4-5-20251001',
    powerful: 'claude-opus-4-6',
  },
  openai: {
    default: 'gpt-5.1',
    fast: 'gpt-5.1-mini',
    powerful: 'gpt-5.1',
  },
  google: {
    default: 'gemini-3.1-pro',
    fast: 'gemini-2.0-flash-lite',
    powerful: 'gemini-3.1-pro',
  },
  ollama: {
    default: 'llama3.2',
    fast: 'phi3',
    powerful: 'codellama',
  },
  minimax: {
    default: 'MiniMax-M2',
    fast: 'MiniMax-M2',
    powerful: 'MiniMax-M2.5',
  },
} as const

export const LLM_MODEL_OPTIONS = {
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-5.1',
    'gpt-5.1-mini',
    'gpt-5.1-nano',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  google: [
    'gemini-3.1-pro',
    'gemini-3.0-pro',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  ollama: ['llama3.2', 'mistral', 'codellama', 'neural-chat', 'phi3'],
  minimax: ['MiniMax-M2', 'MiniMax-M2.5'],
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
