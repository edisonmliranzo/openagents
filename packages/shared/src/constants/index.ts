import type { LLMProvider } from '../types/agent'

export const API_VERSION = 'v1'
export const API_BASE = `/api/${API_VERSION}`

export const LLM_MODELS = {
  anthropic: {
    default: 'claude-sonnet-4-5-20250929',
    fast: 'claude-haiku-4-5-20251001',
    powerful: 'claude-opus-4-1-20250805',
  },
  openai: {
    default: 'gpt-4.1',
    fast: 'gpt-4.1-mini',
    powerful: 'o3',
  },
  google: {
    default: 'gemini-2.5-pro',
    fast: 'gemini-2.5-flash',
    powerful: 'gemini-2.5-pro',
  },
  ollama: {
    default: 'llama3.2',
    fast: 'llama3.1:8b',
    powerful: 'llama3.3:70b',
  },
  minimax: {
    default: 'MiniMax-M2.7',
    fast: 'MiniMax-M2.7-highspeed',
    powerful: 'MiniMax-M2.7',
  },
  perplexity: {
    default: 'sonar-pro',
    fast: 'sonar',
    powerful: 'sonar-reasoning-pro',
  },
} as const

export const LLM_MODEL_OPTIONS = {
  anthropic: [
    // Claude 4.x — latest generation
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-1-20250805',
    // Aliases (always point to latest snapshot)
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
  ],
  openai: [
    // GPT-4.1 family
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    // GPT-4o family
    'gpt-4o',
    'gpt-4o-mini',
    // Reasoning models
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  google: [
    // Gemini 2.5 — current flagship
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    // Gemini 2.0
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  ollama: [
    // Llama 4
    'llama4-scout',
    'llama4-maverick',
    // Llama 3.3 / 3.2 / 3.1
    'llama3.3:70b',
    'llama3.2',
    'llama3.1:8b',
    // Coding
    'codellama',
    // Reasoning
    'qwen2.5:32b',
    'qwq',
    'deepseek-r1:7b',
    'deepseek-r1:32b',
    // Small / fast
    'phi4',
    'phi3',
    'gemma3',
    'gemma3:1b',
    'mistral',
  ],
  minimax: [
    // M2.7 — latest reasoning series
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
    // M2.5
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
    // M2 / M1 / Text-01
    'MiniMax-M2',
    'MiniMax-M1',
    'MiniMax-Text-01',
  ],
  perplexity: [
    // Sonar search
    'sonar',
    'sonar-pro',
    // Sonar reasoning
    'sonar-reasoning',
    'sonar-reasoning-pro',
    // Deep research
    'sonar-deep-research',
  ],
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
    bestFor: 'Agentic coding, long-horizon tasks, and reliable multi-step tool orchestration.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['best-in-class agentic coding (Sonnet 4.5)', 'strong instruction following', 'stable multi-step tool use'],
    cautions: ['higher latency than smaller models', 'requires external API key'],
  },
  openai: {
    label: 'OpenAI',
    bestFor: 'General-purpose tasks, structured output, and advanced reasoning with o3/o4-mini.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['GPT-4.1 excels at instruction following', 'o3/o4-mini for deep reasoning', 'broad model family'],
    cautions: ['reasoning models (o3, o4-mini) are slower', 'requires external API key'],
  },
  google: {
    label: 'Google Gemini',
    bestFor: 'Large-context tasks, multimodal workflows, and cost-effective fast runs.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['Gemini 2.5 Pro leads coding benchmarks', 'large context windows', 'Flash models are fast and cheap'],
    cautions: ['tool behavior can vary across model variants', 'requires external API key'],
  },
  ollama: {
    label: 'Ollama',
    bestFor: 'Private local runs, offline fallback, and cost-free development.',
    toolUse: 'basic',
    latency: 'variable',
    contextProfile: 'local',
    strengths: ['local execution — no API cost', 'Llama 4 Scout/Maverick available', 'works offline'],
    cautions: ['quality depends on installed model', 'tool-heavy runs may be less reliable'],
  },
  minimax: {
    label: 'MiniMax',
    bestFor: 'Reasoning tasks with the M2.7 series — fast, capable, and cost-efficient.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['MiniMax-M2.7 is a strong reasoning model', 'highspeed variant for fast throughput', '1M token context on M1/Text-01'],
    cautions: ['newer API — fewer tested paths', 'requires external API key'],
  },
  perplexity: {
    label: 'Perplexity',
    bestFor: 'Real-time web-grounded answers, research synthesis, and current-events queries.',
    toolUse: 'basic',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['built-in web search grounding', 'Sonar Deep Research for exhaustive reports', 'sonar-reasoning-pro for CoT'],
    cautions: ['tool-calling is less proven', 'requires external API key'],
  },
} as const

export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const SHORT_TERM_MEMORY_LIMIT = 40 // last N messages for context

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
