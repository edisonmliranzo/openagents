import type { LLMProvider } from '../types/agent'

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
  ollama: [
    'llama3.2',
    'mistral',
    'codellama',
    'neural-chat',
    'phi3',
    'gemma',
    'gemma3',
    'gemma3:1b',
    'nemotron',
    'nemotron-mini',
    'huihui_ai/kimi-k2',
    'kimi-k2:1t-cloud',
    'kimi-k2.5:cloud',
    'minimax-m1:cloud',
    'minimax-m2:cloud',
    'minimax-m2.5:cloud',
  ],
  minimax: ['MiniMax-M2', 'MiniMax-M2.5'],
} as const

export const LLM_PROVIDER_CAPABILITIES: Record<
  LLMProvider,
  {
    label: string
    bestFor: string
    toolUse: 'strong' | 'good' | 'basic'
    latency: 'fast' | 'balanced' | 'variable'
    contextProfile: 'standard' | 'large' | 'local'
    strengths: string[]
    cautions: string[]
  }
> = {
  anthropic: {
    label: 'Anthropic',
    bestFor: 'Long-form reasoning, coding, and reliable tool orchestration.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['strong instruction following', 'good code quality', 'stable multi-step tool use'],
    cautions: ['higher latency than smaller models', 'requires external API key'],
  },
  openai: {
    label: 'OpenAI',
    bestFor: 'General-purpose assistant runs with strong tool calling and broad model coverage.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['broad model family', 'strong reasoning', 'good structured output support'],
    cautions: ['quality varies by selected model tier', 'requires external API key'],
  },
  google: {
    label: 'Google Gemini',
    bestFor: 'Large-context tasks, search-heavy synthesis, and multimodal-friendly workflows.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['large context windows', 'good retrieval-style prompting', 'strong value on flash models'],
    cautions: ['tool behavior can vary more across model variants', 'requires external API key'],
  },
  ollama: {
    label: 'Ollama',
    bestFor: 'Private local runs, offline fallback, and cost-controlled development environments.',
    toolUse: 'basic',
    latency: 'variable',
    contextProfile: 'local',
    strengths: ['local execution', 'no per-token API cost', 'works as fallback without cloud keys'],
    cautions: ['quality depends on installed local model', 'tool-heavy runs may be less reliable'],
  },
  minimax: {
    label: 'MiniMax',
    bestFor: 'Alternative cloud routing where you want another capable general model option.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'standard',
    strengths: ['competitive latency', 'simple model lineup', 'useful secondary provider'],
    cautions: ['fewer tested paths in this codebase', 'requires external API key'],
  },
} as const

export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const SHORT_TERM_MEMORY_LIMIT = 20 // last N messages for context

export const QUEUE_NAMES = {
  approvals: 'approvals',
  approvalsDeadLetter: 'approvals-dead-letter',
  toolRuns: 'tool-runs',
  extractionJobs: 'extraction-jobs',
  ciHealer: 'ci-healer',
  workflowRuns: 'workflow-runs',
} as const

export const APPROVAL_JOB_NAMES = {
  resolved: 'approval.resolved',
  deadLetter: 'approval.dead_letter',
} as const

export const EXTRACTION_JOB_NAMES = {
  run: 'extraction.run',
} as const

export const CI_HEALER_JOB_NAMES = {
  run: 'ci_healer.run',
} as const

export const WORKFLOW_JOB_NAMES = {
  run: 'workflow.run',
} as const

export * from './project'
