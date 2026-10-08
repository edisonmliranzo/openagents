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
    default: 'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
    fast: 'phi4-mini',
    powerful: 'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
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
  nvidia: {
    default: 'nvidia/nemotron-3-super-120b-a12b',
    fast: 'stepfun-ai/step-3.7-flash',
    powerful: 'nvidia/nemotron-3-ultra-550b-a55b',
  },
  atlascloud: {
    default: 'deepseek-v3',
    fast: 'meta/llama-4-scout-17b-16e-instruct',
    powerful: 'deepseek-r1',
  },
  groq: {
    default: 'llama-3.3-70b-versatile',
    fast: 'llama-3.1-8b-instant',
    powerful: 'llama-3.3-70b-versatile',
  },
  mistral: {
    default: 'mistral-large-latest',
    fast: 'mistral-small-latest',
    powerful: 'mistral-large-latest',
  },
  deepseek: {
    default: 'deepseek-chat',
    fast: 'deepseek-chat',
    powerful: 'deepseek-reasoner',
  },
  xai: {
    default: 'grok-3',
    fast: 'grok-3-mini',
    powerful: 'grok-3',
  },
  openrouter: {
    default: 'meta-llama/llama-3.3-70b-instruct',
    fast: 'meta-llama/llama-3.1-8b-instruct',
    powerful: 'anthropic/claude-sonnet-4',
  },
  together: {
    default: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    fast: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    powerful: 'deepseek-ai/DeepSeek-R1',
  },
  custom: {
    default: 'default',
    fast: 'default',
    powerful: 'default',
  },
  meta: {
    default: 'muse-spark-1.3',
    fast: 'muse-spark-1.3',
    powerful: 'muse-spark-1.3',
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
    // GPT-5.4 family
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    // GPT-4.1 family
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    // GPT-4.5 preview
    'gpt-4.5-preview',
    // GPT-4o family
    'gpt-4o',
    'gpt-4o-mini',
    // Reasoning models — o3 / o4
    'o3',
    'o3-mini',
    'o4-mini',
    // Reasoning models — o1
    'o1',
    'o1-mini',
    'o1-pro',
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
    // Qwen3.8 27B — trending main brain: tools + thinking + vision, CPU-viable
    'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
    // Xing 4.0 — MoE (needs newer llama.cpp; keep for reference)
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
  nvidia: [
    // Verified live on NIM (retired Llama 3.x / Nemotron v1 / Mixtral ids removed — they 410)
    'nvidia/nemotron-3-super-120b-a12b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'stepfun-ai/step-3.7-flash',
    'minimaxai/minimax-m3',
    'meta/llama-4-maverick-17b-128e-instruct',
    'qwen/qwen2.5-coder-32b-instruct',
  ],
  atlascloud: [
    'owl',
    'deepseek-r1',
    'deepseek-v3',
    'qwen/qwen2.5-72b-instruct',
    'meta/llama-4-scout-17b-16e-instruct',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-groq-70b-8192-tool-use-preview',
    'mixtral-8x7b-32768',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-medium-latest',
    'mistral-small-latest',
    'mistral-saba-latest',
    'codestral-latest',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  xai: [
    'grok-3',
    'grok-3-mini',
    'grok-2-1212',
    'grok-2-vision-1212',
  ],
  openrouter: [
    // Popular routes — any OpenRouter model id works (type it in chat with /model)
    'meta-llama/llama-3.3-70b-instruct',
    'meta-llama/llama-3.1-8b-instruct',
    'anthropic/claude-sonnet-4',
    'openai/gpt-4o',
    'google/gemini-2.5-pro',
    'deepseek/deepseek-r1',
  ],
  together: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-R1',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-72B-Instruct-Turbo',
  ],
  custom: [
    // User-defined OpenAI-compatible endpoint — set the model name your server expects
    'default',
  ],
  meta: [
    // Meta Model API (https://dev.meta.ai) — Muse Spark, OpenAI-compatible
    'muse-spark-1.3',
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
    strengths: ['local execution — no API cost', 'Qwen3.8 27B main brain (tools + thinking + vision)', 'phi4-mini fast tier for casual turns', 'works offline'],
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
  nvidia: {
    label: 'NVIDIA NIM',
    bestFor: 'GPU-accelerated inference on top open models — Llama 4, Nemotron, DeepSeek, Qwen via NVIDIA cloud.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['access to Llama 4 Scout/Maverick', 'Nemotron ultra models', 'DeepSeek R1 & Qwen via NIM', 'fast GPU-backed inference'],
    cautions: ['requires NVIDIA_API_KEY from build.nvidia.com', 'model availability may vary'],
  },
  atlascloud: {
    label: 'AtlasCloud',
    bestFor: 'Unified access to 300+ models — DeepSeek R1/V3, Llama 4, Qwen — via a single OpenAI-compatible API.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['300+ models via one API', 'DeepSeek R1 & V3', 'Llama 4 Scout', 'OpenAI-SDK compatible'],
    cautions: ['requires ATLASCLOUD_API_KEY from atlascloud.ai', 'tool-call quality varies by model'],
  },
  groq: {
    label: 'Groq',
    bestFor: 'Ultra-fast inference on Llama and Mixtral via Groq LPUs.',
    toolUse: 'good',
    latency: 'fast',
    contextProfile: 'large',
    strengths: ['fastest time-to-first-token in class', 'generous free tier', 'OpenAI-compatible API'],
    cautions: ['requires GROQ_API_KEY from console.groq.com', 'tool-call quality varies by model'],
  },
  mistral: {
    label: 'Mistral',
    bestFor: 'European frontier models — Mistral Large for reasoning, Codestral for code.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['strong multilingual performance', 'Codestral for code completion', 'OpenAI-compatible La Plateforme API'],
    cautions: ['requires MISTRAL_API_KEY from console.mistral.ai', 'tool-call quality varies by model'],
  },
  deepseek: {
    label: 'DeepSeek',
    bestFor: 'DeepSeek V3 chat and R1 reasoning at commodity pricing.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['R1 rival-class reasoning traces', 'very low cost per token', 'OpenAI-compatible API'],
    cautions: ['requires DEEPSEEK_API_KEY from platform.deepseek.com', 'R1 reasons before answering — slower first token'],
  },
  xai: {
    label: 'xAI Grok',
    bestFor: 'Grok models with real-time X grounding and contrarian reasoning.',
    toolUse: 'good',
    latency: 'balanced',
    contextProfile: 'large',
    strengths: ['Grok 3 flagship + fast mini variant', 'OpenAI-compatible API'],
    cautions: ['requires XAI_API_KEY from console.x.ai', 'tool-call quality varies by model'],
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
    bestFor: 'Fast open-model inference — Llama, DeepSeek, Qwen, Flux — on Together GPUs.',
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
