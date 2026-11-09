import type { LLMProvider } from '../types/agent'

export const API_VERSION = 'v1'
export const API_BASE = `/api/${API_VERSION}`

export const LLM_MODELS = {
  apisrouter: {
    default: 'claude-sonnet-5.5',
    fast: 'deepseek-v4.1-flash',
    powerful: 'claude-opus-5.5',
  },
  anthropic: {
    default: 'claude-sonnet-5.5',
    fast: 'claude-haiku-5.5',
    powerful: 'claude-opus-5.5',
  },
  openai: {
    default: 'gpt-6.1-sol-pro',
    fast: 'gpt-6-luna',
    powerful: 'gpt-6.1-terra-pro',
  },
  google: {
    default: 'gemini-4-argon',
    fast: 'gemini-3.8-flash',
    powerful: 'gemini-4-argon',
  },
  ollama: {
    default: 'phi4-mini',
    fast: 'phi4-mini',
    powerful: 'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
  },
  minimax: {
    default: 'minimax-m3.1-flash',
    fast: 'minimax-m3.1-flash',
    powerful: 'minimax-m3',
  },
  perplexity: {
    default: 'sonar-pro',
    fast: 'sonar',
    powerful: 'sonar-reasoning-pro',
  },
  nvidia: {
    default: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    fast: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    powerful: 'nvidia/nemotron-3-ultra-550b-a55b',
  },
  atlascloud: {
    default: 'deepseek-v4.1-flash',
    fast: 'llama-4-scout',
    powerful: 'deepseek-v4-pro-0813',
  },
  groq: {
    default: 'llama-4-maverick',
    fast: 'llama-4-scout',
    powerful: 'llama-4-maverick',
  },
  mistral: {
    default: 'mistral-large-4-0',
    fast: 'mistral-small-2603',
    powerful: 'devstral-2512',
  },
  deepseek: {
    default: 'deepseek-v4.1-flash',
    fast: 'deepseek-v4.1-flash',
    powerful: 'deepseek-v4-pro-0813',
  },
  xai: {
    default: 'grok-4.7',
    fast: 'grok-4.6',
    powerful: 'grok-4.7',
  },
  openrouter: {
    default: 'anthropic/claude-sonnet-5.5',
    fast: 'deepseek/deepseek-v4.1-flash',
    powerful: 'anthropic/claude-opus-5.5',
  },
  together: {
    default: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    fast: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    powerful: 'deepseek-ai/DeepSeek-V4-Pro',
  },
  custom: {
    default: 'default',
    fast: 'default',
    powerful: 'default',
  },
  meta: {
    default: 'muse-spark-1.3',
    fast: 'muse-ember-1.0',
    powerful: 'muse-wonder-1.0',
  },
} as const

/**
 * Which model should run which kind of work.
 *
 * `chat` is the conversation the user is in right now. The rest are the
 * heavier, unattended jobs — those are the ones worth spending a bigger model
 * on.
 */
export type ModelRole = 'chat' | 'artifact' | 'scheduled' | 'subagent' | 'background'

export const LLM_MODEL_OPTIONS = {
  apisrouter: [
    // APIsRouter.dev (https://apisrouter.dev/v1) — 93+ Verified Live 2026 Frontier Models
    // Featured Flagships
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'gpt-6.1-sol-pro',
    'kimi-k2.7-code',
    'deepseek-v4.1-flash',
    'gemini-4-argon',
    'kimi-k3.1-pro',
    'grok-4.7',
    'qwen3.8-max-prime',
    'gpt-6.1-terra-pro',
    'gemini-3.8-flash',
    'claude-haiku-5.5',
    'deepseek-v4-pro-0813',
    'devstral-2512',
    'glm-5.3',
    'gpt-6-luna-pro',
    'grok-build-0.1',
    'llama-4-maverick',
    'minimax-m3.1-flash',
    'mistral-large-4-0',
    'qwen3.8-flash',
    // Anthropic Claude 5 & 4.8 Series
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-opus-4.8',
    // OpenAI GPT-6.1 & GPT-6 Series
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-6-sol-pro',
    'gpt-6-sol',
    'gpt-6-luna',
    // DeepSeek V4.1, V4 & V3.2 Series
    'deepseek-v4.1-flash-1017',
    'deepseek-v4-pro',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
    'deepseek-v3.2',
    // Google Gemini 4, 3.x & Omni Series
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-omni-1.2-flash',
    'gemini-omni-1.1-flash',
    'gemini-nano-banana-2.1',
    // xAI Grok 4.x Series
    'grok-4.6',
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-multi-agent',
    'grok-4.20',
    // Moonshot Kimi K3 & K2 Series
    'kimi-k3',
    'kimi-k2.6',
    'kimi-k2.5',
    'kimi-k2-thinking',
    'kimi-k2-0905',
    'kimi-k2',
    // Alibaba Qwen 3.8 & 3.7 Series
    'qwen3.8-2.4t-a95b',
    'qwen3.8-max-0902',
    'qwen3.8-omni-flash',
    'qwen3.8-27b',
    'qwen3.7-plus',
    'qwen3.7-flash',
    // Meta Llama 4 & 3.x Series
    'llama-4-scout',
    'llama-3.3-70b-instruct',
    'llama-3.1-70b-instruct',
    'llama-3.1-8b-instruct',
    'llama-3.2-3b-instruct',
    'llama-3.2-1b-instruct',
    'llama-guard-4-12b',
    // Mistral 4 & Ministral 3 Series
    'mistral-medium-3-5',
    'mistral-small-2603',
    'mistral-large-2512',
    'ministral-14b-2512',
    'ministral-8b-2512',
    'ministral-3b-2512',
    // MiniMax M3.1 & M3 Series
    'minimax-m3',
    'minimax-m2.7',
    'minimax-m2.5',
    'minimax-m1',
    // Z.ai GLM 5.3 & 5V Series
    'glm-5.3-prime',
    'glm-5.3-flashx',
    'glm-5.3-flashx-legal',
    'glm-5.3-flash',
    'glm-5v-turbo',
    'glm-5.2',
    'glm-5.1',
    // NVIDIA Nemotron 3.5 & 3 Series
    'nemotron-3.5-super-vl',
    'nemotron-3.5-lightning',
    'nemotron-3-ultra-550b-a55b',
    'nemotron-3-super-120b-a12b',
    'nemotron-3-nano-30b-a3b',
    'nemotron-3.5-content-safety',
    // Cohere Command A Series
    'command-a-plus',
    'command-a',
    'command-r-plus-08-2024',
    'command-r-08-2024',
    'command-r7b-12-2024',
  ],
  anthropic: [
    // Claude 5.5 & 5 — latest generation
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'claude-haiku-5.5',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-opus-4.8',
    // Claude 4.5 fallback aliases
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
  ],
  openai: [
    // GPT-6.1 & GPT-6 family
    'gpt-6.1-sol-pro',
    'gpt-6.1-terra-pro',
    'gpt-6-luna-pro',
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-6-sol-pro',
    'gpt-6-sol',
    'gpt-6-luna',
    // GPT-5.4 & o-series
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'o4-mini',
    'o3',
    'o3-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  google: [
    // Gemini 4 & 3.8 — current flagship
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-omni-1.2-flash',
    'gemini-omni-1.1-flash',
    'gemini-nano-banana-2.1',
    // Gemini 2.5
    'gemini-2.5-pro',
    'gemini-2.5-flash',
  ],
  ollama: [
    // Qwen3.8 27B — trending main brain: tools + thinking + vision, CPU-viable
    'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
    'qwen3.8:27b',
    // Xing 4.0 — MoE
    'hf.co/Venastine-Research/Xing4.0-29B-A4B-GGUF',
    // Gemma 4 (12B / E4B / E2B)
    'hf.co/unsloth/gemma-4-12b-it-GGUF',
    'hf.co/unsloth/gemma-4-E4B-it-GGUF',
    'hf.co/unsloth/gemma-4-E2B-it-GGUF',
    // Fast local smalls
    'phi4-mini',
    'deepseek-r1:8b',
  ],
  minimax: [
    // M3.1 & M3 — latest reasoning & agentic series
    'minimax-m3.1-flash',
    'minimax-m3',
    'minimax-m2.7',
    'minimax-m2.5',
    'minimax-m1',
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
  ],
  perplexity: [
    // Sonar search & reasoning
    'sonar-pro',
    'sonar-reasoning-pro',
    'sonar-deep-research',
    'sonar-reasoning',
    'sonar',
  ],
  nvidia: [
    // Verified live on NIM
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'google/gemma-4-31b-it',
    'openai/gpt-oss-20b',
  ],
  atlascloud: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro-0813',
    'qwen3.8-max-prime',
    'llama-4-maverick',
    'llama-4-scout',
    'meta/llama-4-scout-17b-16e-instruct',
  ],
  groq: [
    'llama-4-maverick',
    'llama-4-scout',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  mistral: [
    'mistral-large-4-0',
    'devstral-2512',
    'mistral-medium-3-5',
    'mistral-small-2603',
    'mistral-large-2512',
    'ministral-14b-2512',
    'ministral-8b-2512',
    'ministral-3b-2512',
    'codestral-latest',
  ],
  deepseek: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro-0813',
    'deepseek-v4.1-flash-1017',
    'deepseek-v4-pro',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
    'deepseek-v3.2',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  xai: [
    'grok-4.7',
    'grok-build-0.1',
    'grok-4.6',
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-multi-agent',
    'grok-4.20',
    'grok-3',
  ],
  openrouter: [
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-opus-5.5',
    'openai/gpt-6.1-sol-pro',
    'openai/gpt-6.1-terra-pro',
    'google/gemini-4-argon',
    'google/gemini-3.8-flash',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro-0813',
    'moonshotai/kimi-k2.7-code',
    'x-ai/grok-4.7',
    'qwen/qwen3.8-max-prime',
    'meta-llama/llama-4-maverick',
  ],
  together: [
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'deepseek-ai/DeepSeek-V4.1-Flash',
    'deepseek-ai/DeepSeek-V4-Pro',
    'Qwen/Qwen3.8-Max-Prime',
  ],
  custom: [
    // User-defined OpenAI-compatible endpoint — set the model name your server expects
    'default',
  ],
  meta: [
    // Meta Model API (https://dev.meta.ai) — Muse Spark, OpenAI-compatible
    'muse-spark-1.3',
    'muse-ember-1.0',
    'muse-spark-1.2',
    'muse-spark-1.1',
    'muse-spark-1.3-contributor',
    'muse-spark-1.2-contributor',
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
  apisrouter: {
    label: 'APIsRouter.dev (Main Provider)',
    bestFor: 'Primary unified AI coding & agent gateway (https://apisrouter.dev/v1) — 93+ live frontier models including Claude Sonnet 5.5, Opus 5.5, GPT-6.1 Sol Pro, Gemini 4 Argon, DeepSeek V4.1 Flash, Kimi K2.7 Code, Grok 4.7, Qwen3.8 Max Prime, and Llama 4 Maverick.',
    toolUse: 'strong',
    latency: 'fast',
    contextProfile: 'large',
    strengths: [
      'official main gateway at https://apisrouter.dev/v1 (93+ verified real LLMs)',
      'Claude Sonnet 5.5 & Opus 5.5, GPT-6.1 Sol/Terra Pro, Gemini 4 Argon & 3.8 Flash',
      'Kimi K2.7 Code, DeepSeek V4.1 Flash & V4 Pro, Grok 4.7, Qwen3.8 Max Prime, Llama 4 Maverick',
      '210+ tok/s H200 throughput, 99.98% dual-cluster auto-failover & pure Pay-As-You-Go billing',
    ],
    cautions: ['get your apr-sk-live-... API key at https://apisrouter.dev/ and paste it in Settings > Config'],
  },
  anthropic: {
    label: 'Anthropic',
    bestFor: 'Agentic coding, 1M-context reasoning, and reliable multi-step tool orchestration with Claude Sonnet 5.5 & Opus 5.5.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['best-in-class agentic coding (Claude Sonnet 5.5 & Opus 5.5)', '1M context + 128K output tokens', 'stable multi-step tool use'],
    cautions: ['higher latency on Opus 5.5 deep reasoning runs', 'requires external API key'],
  },
  openai: {
    label: 'OpenAI',
    bestFor: 'Next-gen agentic reasoning, complex API orchestration, and computer use with GPT-6.1 Sol Pro, Terra Pro & Luna Pro.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['GPT-6.1 Sol Pro & Terra Pro for complex reasoning (1.05M context)', 'GPT-6 Luna for fast agentic execution', 'broad model family'],
    cautions: ['pro reasoning mode spends more tokens on complex tasks', 'requires external API key'],
  },
  google: {
    label: 'Google Gemini',
    bestFor: 'Multimodal workflows, 1M+ context tasks, and ultra-fast runs with Gemini 4 Argon & Gemini 3.8 Flash.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['Gemini 4 Argon leads multimodal & abstract reasoning', 'Gemini 3.8 Flash & Omni 1.2 Flash for low-latency streaming', 'massive context windows'],
    cautions: ['tool behavior can vary across model variants', 'requires external API key'],
  },
  ollama: {
    label: 'Ollama',
    bestFor: 'Private local runs, offline fallback, and cost-free development.',
    toolUse: 'basic',
    latency: 'variable',
    contextProfile: 'local',
    strengths: ['local execution — no API cost', 'Qwen3.8 27B main brain (tools + thinking + vision)', 'phi4-mini fast tier for casual turns', 'works offline'],
    cautions: ['quality depends on installed model', 'tool-heavy runs may be less reliable'],
  },
  minimax: {
    label: 'MiniMax',
    bestFor: 'High-speed agentic reasoning with MiniMax M3.1 Flash & MiniMax M3.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['MiniMax M3.1 Flash & M3 reasoning models', 'ultra-fast throughput', '1M token context support'],
    cautions: ['requires external API key'],
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
  nvidia: {
    label: 'NVIDIA NIM',
    bestFor: 'GPU-accelerated inference on Nemotron 3.5 Super VL, Nemotron 3 Ultra 550B, and Gemma 4 31B.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['Nemotron 3.5 Super VL & Lightning', 'Nemotron 3 Ultra 550B', 'Gemma 4 31B via NIM', 'fast GPU-backed inference'],
    cautions: ['requires NVIDIA_API_KEY from build.nvidia.com', 'model availability may vary'],
  },
  atlascloud: {
    label: 'AtlasCloud',
    bestFor: 'Unified access to 300+ models — DeepSeek V4.1 Flash, Qwen3.8 Max Prime, Llama 4 Maverick — via a single OpenAI-compatible API.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['300+ models via one API', 'DeepSeek V4.1 & V4 Pro', 'Llama 4 Maverick & Scout', 'OpenAI-SDK compatible'],
    cautions: ['requires ATLASCLOUD_API_KEY from atlascloud.ai', 'tool-call quality varies by model'],
  },
  groq: {
    label: 'Groq',
    bestFor: 'Ultra-fast LPU inference on Llama 4 Maverick, Llama 4 Scout, and Llama 3.3 70B.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['fastest time-to-first-token in class', 'Llama 4 Maverick & Scout support', 'OpenAI-compatible API'],
    cautions: ['requires GROQ_API_KEY from console.groq.com', 'tool-call quality varies by model'],
  },
  mistral: {
    label: 'Mistral',
    bestFor: 'European frontier models — Mistral Large 4 for reasoning, Devstral 2 (2512) for agentic coding.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['Mistral Large 4 & Medium 3.5', 'Devstral 2512 for software engineering agents', 'Mistral Small 4 (2603) for fast turns'],
    cautions: ['requires MISTRAL_API_KEY from console.mistral.ai', 'tool-call quality varies by model'],
  },
  deepseek: {
    label: 'DeepSeek',
    bestFor: 'DeepSeek V4.1 Flash and DeepSeek V4 Pro (0813) reasoning & coding at commodity pricing.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['DeepSeek V4.1 Flash & V4 Pro frontier reasoning', 'DeepSeek V3.2 ultra-low cost per token', 'OpenAI-compatible API'],
    cautions: ['requires DEEPSEEK_API_KEY from platform.deepseek.com'],
  },
  xai: {
    label: 'xAI Grok',
    bestFor: 'Grok 4.7, Grok Build 0.1, and Grok 4.20 Multi-Agent with real-time grounding and coding speed.',
    toolUse: 'strong',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['Grok 4.7 flagship + Grok Build 0.1 for engineering', 'Grok 4.20 Multi-Agent orchestration', 'OpenAI-compatible API'],
    cautions: ['requires XAI_API_KEY from console.x.ai'],
  },
  openrouter: {
    label: 'OpenRouter',
    bestFor: 'One key for 300+ models from every lab — route by price, latency, or capability.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['any model id works — just type it', 'automatic fallbacks and routing', 'OpenAI-compatible API'],
    cautions: ['requires OPENROUTER_API_KEY from openrouter.ai', 'tool-call quality varies by underlying model'],
  },
  together: {
    label: 'Together AI',
    bestFor: 'Fast open-model inference — Llama 4 Maverick/Scout, DeepSeek V4.1, Qwen3.8 Max Prime — on Together GPUs.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['broad open-model catalog', 'Turbo endpoints for low latency', 'OpenAI-compatible API'],
    cautions: ['requires TOGETHER_API_KEY from api.together.xyz', 'tool-call quality varies by model'],
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    bestFor: 'Any OpenAI-compatible server — LM Studio, vLLM, llama.cpp, text-generation-webui, or a corporate gateway.',
    toolUse: 'good',
    latency: 'variable',
    contextProfile: 'standard',
    strengths: ['works with any /v1 chat-completions server', 'local endpoints (localhost) work out of the box', 'set any model name your server expects'],
    cautions: ['you provide the base URL and key', 'non-local URLs need ALLOW_CUSTOM_LLM_BASE_URLS=true on the API server'],
  },
  meta: {
    label: 'Meta Muse Spark',
    bestFor: 'Long-horizon agentic coding and tool orchestration — 1M context, parallel tool calls, streamed arguments.',
    toolUse: 'strong',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['1M-token context window', 'parallel + streamed tool calling', 'reasoning carries across turns', 'OpenAI-SDK compatible'],
    cautions: ['requires MODEL_API_KEY from dev.meta.ai', 'pay-as-you-go billing on Meta side'],
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
