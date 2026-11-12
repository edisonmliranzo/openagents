'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import {
  LLM_MODELS,
  LLM_MODEL_OPTIONS,
  LLM_PROVIDER_CAPABILITIES,
  type Message,
  type SessionPatchInput,
  type SessionRow,
  type UserSettings,
} from '@openagents/shared'
import {
  ASSISTANT_MODE_DEFINITIONS,
  buildAssistantModePrompt,
  getAssistantModeDefinition,
  type AssistantMode,
} from './assistantModes'
import { MessageBubble } from './MessageBubble'
import {
  buildOperatorCommandHelpText,
  isOperatorCommandId,
  parseSlashCommand,
  SlashCommandPalette,
  expandSlashCommand,
} from './SlashCommandPalette'
import { PinnedContext, buildPinnedContextBlock, type PinnedItem } from './PinnedContext'
import { BrowserActivityCard } from './BrowserActivityCard'
import { SuggestionChips } from './SuggestionChips'
import { TemplateLauncher } from './TemplateLauncher'
import { PlanChecklist } from './PlanChecklist'
import { ResponsePresets } from './ResponsePresets'
import { WebRtcVoiceControls } from './WebRtcVoiceControls'
import { OpenAgentsPowerToolbar, SPECIALIST_OPTIONS } from './OpenAgentsPowerSuite'
import { FrontierEnginesDock } from './FrontierEnginesDock'
import { storageGet, storageSet } from '@/lib/storage'
import clsx from 'clsx'
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Code,
  Command,
  Gauge,
  LayoutList,
  Menu,
  Mic,
  MessageSquarePlus,
  Paperclip,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react'

interface ChatWindowProps {
  assistantMode: AssistantMode
  onAssistantModeChange: (mode: AssistantMode) => void
  gatewayConnected: boolean
  onNewSession: () => Promise<void> | void
  onRuntimeLabelChange: (label: string) => void
  onOpenMobileSessions?: () => void
}

type RuntimeProvider = keyof typeof LLM_MODEL_OPTIONS

const THINK_LEVELS = ['', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const BINARY_THINK_LEVELS = ['', 'off', 'on'] as const
const VERBOSE_LEVELS = [
  { value: '', label: 'inherit' },
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
  { value: 'full', label: 'full' },
] as const
const REASONING_LEVELS = ['', 'off', 'on', 'stream'] as const
const RUNTIME_PROVIDERS = Object.keys(LLM_MODEL_OPTIONS) as RuntimeProvider[]
const OLLAMA_FALLBACK_MODELS = [...(LLM_MODEL_OPTIONS.ollama as unknown as string[])]

function formatIntentLabel(intent: string | undefined) {
  if (!intent) return null
  const normalized = intent
    .replace(/^custom-intent-/, '')
    .replace(/-/g, ' ')
    .trim()
  if (!normalized) return null
  return normalized
}

function statusChipClass(status: string | null, isStreaming: boolean) {
  const effective = status ?? (isStreaming ? 'running' : 'ready')
  if (effective === 'error') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
  if (effective.includes('approval')) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
  if (effective === 'done' || effective === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
  return 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]'
}

function modeButtonClass(active: boolean) {
  if (active) {
    return 'border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--tone-strong)] shadow-sm dark:text-[var(--tone-inverse)]'
  }
  return 'border-[var(--border)] bg-[var(--surface)] text-[var(--tone-muted)] hover:bg-[var(--surface-muted)] dark:text-[var(--tone-inverse)]'
}

function controlButtonClass() {
  return 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e4e7ec] bg-white text-[#667085] transition hover:border-[#f2b7b2] hover:text-[#ef4444] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2d3347] dark:bg-[#141824] dark:text-[#c9d1e0]'
}

function getDefaultRuntime(settings?: Pick<UserSettings, 'preferredProvider' | 'preferredModel'> | null) {
  const storedProvider =
    typeof window !== 'undefined' ? window.localStorage.getItem('openagents.preferred-provider')?.trim() : ''
  const storedModel =
    typeof window !== 'undefined' ? window.localStorage.getItem('openagents.preferred-model')?.trim() : ''
  return {
    provider: settings?.preferredProvider?.trim() || storedProvider || 'apisrouter',
    model: settings?.preferredModel?.trim() || storedModel || 'claude-sonnet-5.5',
  }
}

function getEffectiveRuntime(
  settings?: Pick<UserSettings, 'preferredProvider' | 'preferredModel'> | null,
  session?: Pick<SessionRow, 'modelProvider' | 'model'> | null,
) {
  const defaults = getDefaultRuntime(settings)
  const provider = session?.modelProvider?.trim() || defaults.provider
  const model = session?.model?.trim() || defaults.model
  return {
    provider,
    model,
    source: session?.modelProvider?.trim() || session?.model?.trim() ? 'session' : 'default',
  } as const
}

function formatRuntimeLabel(
  settings?: Pick<UserSettings, 'preferredProvider' | 'preferredModel'> | null,
  session?: Pick<SessionRow, 'modelProvider' | 'model'> | null,
) {
  const runtime = getEffectiveRuntime(settings, session)
  const prefix = runtime.source === 'session' ? 'Session' : 'Default'
  return `${prefix} (${runtime.model} / ${runtime.provider})`
}

function shortId(value?: string | null) {
  if (!value) return 'session'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function withCurrentOption(options: readonly string[], current: string) {
  if (!current || options.includes(current)) return [...options]
  return [...options, current]
}

function withCurrentLabeledOption(
  options: readonly { value: string; label: string }[],
  current: string,
) {
  if (!current || options.some((option) => option.value === current)) return [...options]
  return [...options, { value: current, label: `${current} (custom)` }]
}

function normalizeProviderId(provider?: string | null) {
  if (!provider) return ''
  const normalized = provider.trim().toLowerCase()
  if (normalized === 'z.ai' || normalized === 'z-ai') return 'zai'
  return normalized
}

function isRuntimeProvider(value: string): value is RuntimeProvider {
  return RUNTIME_PROVIDERS.includes(value as RuntimeProvider)
}

function isBinaryThinkingProvider(provider?: string | null) {
  return normalizeProviderId(provider) === 'zai'
}

function resolveThinkingLevelOptions(provider?: string | null) {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS
}

function resolveThinkingLevelDisplay(value: string, binary: boolean) {
  if (!binary) return value
  if (!value || value === 'off') return value
  return 'on'
}

function resolveThinkingPatchValue(value: string, binary: boolean) {
  if (!value) return null
  if (!binary) return value
  if (value === 'on') return 'low'
  return value
}

const FAVORITE_MODELS_STORAGE_KEY = 'openagents.favorite-models'

function loadFavoriteModels(): Record<string, string[]> {
  const raw = storageGet<Record<string, unknown>>(FAVORITE_MODELS_STORAGE_KEY, {})
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    }
  }
  return out
}

function ModelRow({
  model,
  inUse,
  favorite,
  onToggleFavorite,
  onSelect,
}: {
  model: string
  inUse: boolean
  favorite: boolean
  onToggleFavorite: () => void
  onSelect: () => void
}) {
  return (
    <div
      className={clsx(
        'flex w-full items-center gap-1 rounded-xl px-1 py-0.5 transition',
        inUse
          ? 'bg-[#f4fbf7] dark:bg-[#064e3b]'
          : 'hover:bg-[#f8fafc] dark:hover:bg-[#232837]',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={inUse ? `${model} (in use)` : model}
        className={clsx(
          'flex min-h-[38px] sm:min-h-[32px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 sm:px-2 sm:py-1.5 text-left text-[13px] sm:text-[12px] active:scale-[0.99]',
          inUse
            ? 'font-semibold text-[#10b981] dark:text-[#34d399]'
            : 'text-[#344054] dark:text-[#c9d1e0]',
        )}
      >
        <span className="truncate">{model}</span>
        {inUse ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium">
            In use
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        title={favorite ? `Remove ${model} from favorites` : `Add ${model} to favorites`}
        aria-label={favorite ? `Remove ${model} from favorites` : `Add ${model} to favorites`}
        className={clsx(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition',
          favorite
            ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
            : 'text-slate-300 hover:bg-slate-100 hover:text-amber-500 dark:text-slate-600 dark:hover:bg-slate-800',
        )}
      >
        <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

function formatCommandError(err: unknown, fallback: string) {
  const maybeError = err as { message?: unknown } | null
  if (typeof maybeError?.message === 'string' && maybeError.message.trim()) {
    return maybeError.message.trim()
  }
  return fallback
}

function normalizeRuntimeTestError(err: unknown, fallback: string) {
  const message = formatCommandError(err, fallback)
  if (/api key.*not configured/i.test(message)) return message
  if (/authentication/i.test(message)) return message
  if (/network error|failed to reach api|failed to fetch/i.test(message)) return message
  if (/no local ollama models found/i.test(message)) return message
  return message
}

function sanitizeOllamaModels(models: string[]) {
  const unique = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
  const local = unique.filter((model) => {
    const normalized = model.toLowerCase()
    return !normalized.includes(':cloud') && !normalized.includes('/cloud') && !normalized.endsWith('-cloud')
  })
  const cloud = unique.filter((model) => {
    const normalized = model.toLowerCase()
    return normalized.includes(':cloud') || normalized.includes('/cloud') || normalized.endsWith('-cloud')
  })
  return [...local, ...cloud]
}

function formatOperatorStatusReport(args: {
  settings: UserSettings | null
  session: SessionRow | null
  activeConversationId: string | null
  pendingApprovals: number
  pendingApprovalTools: string[]
  runStatus: string | null
  messageCount: number
}) {
  const defaults = getDefaultRuntime(args.settings)
  const runtime = getEffectiveRuntime(args.settings, args.session)
  const label = args.session?.label?.trim() || 'unset'
  const thinking = args.session?.thinkingLevel?.trim() || 'inherit'
  const verbose = args.session?.verboseLevel?.trim() || 'inherit'
  const reasoning = args.session?.reasoningLevel?.trim() || 'inherit'
  const tokenCount = args.session?.totalTokens ?? 0

  const lines = [
    'Runtime status',
    `session: ${shortId(args.activeConversationId)}`,
    `label: ${label}`,
    `runtime: ${runtime.model} / ${runtime.provider} (${runtime.source})`,
    `thinking: ${thinking}`,
    `verbose: ${verbose}`,
    `reasoning: ${reasoning}`,
    `run: ${args.runStatus ?? 'ready'}`,
    `approvals: ${args.pendingApprovals > 0 ? `${args.pendingApprovals} pending` : 'none pending'}`,
    `tokens: ${tokenCount}`,
    `messages loaded: ${args.messageCount}`,
  ]

  if (runtime.source === 'session') {
    lines.push(`default runtime: ${defaults.model} / ${defaults.provider}`)
  }

  if (args.pendingApprovalTools.length > 0) {
    lines.push(`approval tools: ${args.pendingApprovalTools.join(', ')}`)
  }

  return lines.join('\n')
}

interface AttachedFile {
  name: string
  mimeType: string
  size: number
  content: string   // text content or base64 data URL for images
  isImage: boolean
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'yaml', 'yml',
  'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go',
  'java', 'kt', 'swift', 'c', 'cpp', 'h', 'rs', 'sh', 'bash', 'env',
  'log', 'sql', 'graphql', 'toml', 'ini', 'cfg', 'conf',
])

function isTextFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)
}

function readFileAsAttachment(file: File): Promise<AttachedFile> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith('image/')
    const reader = new FileReader()

    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))

    if (isImage) {
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        content: reader.result as string,
        isImage: true,
      })
      reader.readAsDataURL(file)
    } else if (isTextFile(file)) {
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type || 'text/plain',
        size: file.size,
        content: reader.result as string,
        isImage: false,
      })
      reader.readAsText(file)
    } else {
      // Binary file — include name and size as metadata only
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        content: '',
        isImage: false,
      })
    }
  })
}

function buildFileBlock(file: AttachedFile): string {
  const sizeLabel = file.size < 1024
    ? `${file.size} B`
    : file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

  if (file.isImage) {
    return [
      `[Attached image: ${file.name} (${sizeLabel})]`,
      `data:${file.mimeType};base64,${file.content}`,
    ].join('\n')
  }

  if (!file.content) {
    return `[Attached file: ${file.name} (${sizeLabel}, binary — content not readable as text)]`
  }

  return [
    `[Attached file: ${file.name} (${sizeLabel})]`,
    '---',
    file.content,
    '---',
  ].join('\n')
}

function parseModelCommandArg(arg: string, fallbackProvider: RuntimeProvider) {
  const trimmed = arg.trim()
  if (!trimmed) return null

  if (trimmed.includes('/')) {
    const [providerCandidate, ...rest] = trimmed.split('/')
    const providerId = normalizeProviderId(providerCandidate)
    if (isRuntimeProvider(providerId)) {
      const model = rest.join('/').trim() || LLM_MODELS[providerId].default
      return { provider: providerId, model: model === 'default' ? LLM_MODELS[providerId].default : model }
    }
  }

  const parts = trimmed.split(/\s+/)
  const providerCandidate = normalizeProviderId(parts[0] ?? '')
  if (isRuntimeProvider(providerCandidate)) {
    const model = parts.slice(1).join(' ').trim() || LLM_MODELS[providerCandidate].default
    return {
      provider: providerCandidate,
      model: model === 'default' ? LLM_MODELS[providerCandidate].default : model,
    }
  }

  return {
    provider: fallbackProvider,
    model: trimmed === 'default' ? LLM_MODELS[fallbackProvider].default : trimmed,
  }
}

export function ChatWindow({
  assistantMode,
  onAssistantModeChange,
  gatewayConnected,
  onNewSession,
  onRuntimeLabelChange,
  onOpenMobileSessions,
}: ChatWindowProps) {
  const router = useRouter()
  const {
    messages,
    sendMessage,
    isStreaming,
    activeConversationId,
    learnedSkill,
    runStatus,
    pendingApprovals,
    plan,
    clearPlan,
  } = useChatStore()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [effort, setEffort] = useState<'auto' | 'instant' | 'planned' | 'max'>('auto')
  const wasStreamingRef = useRef(false)
  const [input, setInput] = useState('')
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<UserSettings | null>(null)
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('')
  const [liveProviderModels, setLiveProviderModels] = useState<string[]>([])
  const [operatorMessages, setOperatorMessages] = useState<Message[]>([])
  const [controlsExpanded, setControlsExpanded] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [modelPickerAnchor, setModelPickerAnchor] = useState<{ top: number; left: number } | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [modelScope, setModelScope] = useState<'global' | 'chat'>('global')
  const [favoriteModels, setFavoriteModels] = useState<Record<string, string[]>>({})
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const modelButtonRef = useRef<HTMLButtonElement>(null)
  const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false)
  const mcpPickerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isOffline, setIsOffline] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<string[]>([])
  const [hasSavedApiKey, setHasSavedApiKey] = useState<boolean | null>(null)
  const [quickApiKeyInput, setQuickApiKeyInput] = useState('')
  const [isSavingQuickKey, setIsSavingQuickKey] = useState(false)
  const [personaPickerOpen, setPersonaPickerOpen] = useState(false)
  const [grokDeepSearchActive, setGrokDeepSearchActive] = useState(false)
  const [bigBrainActive, setBigBrainActive] = useState(false)
  const [hermesSteerActive, setHermesSteerActive] = useState(false)
  const [dotsRouterActive, setDotsRouterActive] = useState(false)
  const [agentPersona, setAgentPersona] = useState<{
    name: string
    aura: string
    style: string
  }>({
    name: 'Veda',
    aura: 'from-rose-500 to-orange-500',
    style: 'Warm, proactive & organized',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedPersona = window.localStorage.getItem('oa-muse-persona')
      if (savedPersona) {
        const parsed = JSON.parse(savedPersona)
        if (parsed?.name) {
          setAgentPersona({
            name: String(parsed.name),
            aura: String(parsed.aura || 'from-rose-500 to-orange-500'),
            style: String(parsed.style || 'Warm, proactive & organized'),
          })
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  function updateAgentPersona(next: { name: string; aura: string; style: string }) {
    setAgentPersona(next)
    try {
      window.localStorage.setItem('oa-muse-persona', JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('openagents:persona-changed'))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = JSON.parse(window.localStorage.getItem('oa-offline-queue') ?? '[]')
      if (Array.isArray(saved)) setOfflineQueue(saved.filter((x: unknown): x is string => typeof x === 'string'))
    } catch { /* ignore corrupt queue */ }
    setIsOffline(!navigator.onLine)
    const goOnline = () => {
      setIsOffline(false)
      setOfflineQueue((queue) => {
        const rest = [...queue]
        window.setTimeout(() => {
          rest.forEach((text) => void sendMessage(text).catch(() => undefined))
        }, 800)
        return []
      })
    }
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [sendMessage])

  useEffect(() => {
    try {
      window.localStorage.setItem('oa-offline-queue', JSON.stringify(offlineQueue))
    } catch { /* storage full or unavailable */ }
  }, [offlineQueue])
  const learnedIntentLabel = formatIntentLabel(learnedSkill?.intent)
  const beginnerMode = Boolean(runtimeSettings?.beginnerMode)
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )

  const visibleMessages = useMemo(
    () =>
      [...messages, ...operatorMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages, operatorMessages],
  )

  const effectiveRuntime = useMemo(
    () => getEffectiveRuntime(runtimeSettings, activeSession),
    [runtimeSettings, activeSession],
  )
  const activeProvider = useMemo<RuntimeProvider>(() => {
    const normalized = normalizeProviderId(effectiveRuntime.provider)
    return isRuntimeProvider(normalized) ? normalized : 'ollama'
  }, [effectiveRuntime.provider])
  const effectiveProviderLabel = useMemo(() => {
    const normalized = normalizeProviderId(effectiveRuntime.provider)
    return isRuntimeProvider(normalized)
      ? LLM_PROVIDER_CAPABILITIES[normalized].label
      : effectiveRuntime.provider
  }, [effectiveRuntime.provider])

  const providerModelOptions = useMemo(
    () => {
      const baseOptions = activeProvider === 'ollama'
        ? (() => {
            const merged = [...ollamaModels]
            for (const model of OLLAMA_FALLBACK_MODELS) {
              if (!merged.includes(model)) merged.push(model)
            }
            return merged.length > 0 ? merged : OLLAMA_FALLBACK_MODELS
          })()
        : (() => {
            // Live provider catalog first, then curated entries
            const merged = [...liveProviderModels]
            for (const model of [...LLM_MODEL_OPTIONS[activeProvider]]) {
              if (!merged.includes(model)) merged.push(model)
            }
            return merged
          })()

      return withCurrentOption(
        baseOptions,
        runtimeSettings?.preferredModel?.trim() || LLM_MODELS[activeProvider].default,
      )
    },
    [activeProvider, ollamaModels, liveProviderModels, runtimeSettings?.preferredModel],
  )

  // Refresh the live model catalog whenever the runtime provider changes.
  useEffect(() => {
    if (activeProvider === 'ollama') {
      setLiveProviderModels([])
      return
    }
    let cancelled = false
    sdk.agent
      .listProviderModels(activeProvider)
      .then((result) => {
        if (!cancelled) setLiveProviderModels(result.models ?? [])
      })
      .catch(() => {
        if (!cancelled) setLiveProviderModels([])
      })
    return () => {
      cancelled = true
    }
  }, [activeProvider])

  // Favorite models (per provider, local-only). The in-use model always comes
  // from the effective runtime (session override wins over user default).
  useEffect(() => {
    setFavoriteModels(loadFavoriteModels())
  }, [])

  const inUseModel = effectiveRuntime.model?.trim() || LLM_MODELS[activeProvider].default
  const providerFavorites = useMemo(
    () => favoriteModels[activeProvider] ?? [],
    [favoriteModels, activeProvider],
  )
  const favoriteSet = useMemo(() => new Set(providerFavorites), [providerFavorites])
  const filteredProviderModelOptions = useMemo(() => {
    const q = modelSearchQuery.trim().toLowerCase()
    if (!q) return providerModelOptions
    return providerModelOptions.filter((m) => m.toLowerCase().includes(q))
  }, [providerModelOptions, modelSearchQuery])
  const favoriteOptions = useMemo(
    () => filteredProviderModelOptions.filter((m) => favoriteSet.has(m)),
    [filteredProviderModelOptions, favoriteSet],
  )
  const nonFavoriteOptions = useMemo(
    () => filteredProviderModelOptions.filter((m) => !favoriteSet.has(m)),
    [filteredProviderModelOptions, favoriteSet],
  )

  function toggleFavoriteModel(model: string) {
    setFavoriteModels((prev) => {
      const current = prev[activeProvider] ?? []
      const next = current.includes(model)
        ? current.filter((m) => m !== model)
        : [...current, model]
      const updated = { ...prev, [activeProvider]: next }
      storageSet(FAVORITE_MODELS_STORAGE_KEY, updated)
      return updated
    })
  }

  const sessionProvider = activeSession?.modelProvider ?? runtimeSettings?.preferredProvider ?? null
  const binaryThinking = isBinaryThinkingProvider(sessionProvider)
  const thinkingValue = resolveThinkingLevelDisplay(activeSession?.thinkingLevel ?? '', binaryThinking)
  const thinkingOptions = withCurrentOption(resolveThinkingLevelOptions(sessionProvider), thinkingValue)
  const verboseValue = activeSession?.verboseLevel ?? ''
  const verboseOptions = withCurrentLabeledOption(VERBOSE_LEVELS, verboseValue)
  const reasoningValue = activeSession?.reasoningLevel ?? ''
  const reasoningOptions = withCurrentOption(REASONING_LEVELS, reasoningValue)
  const pendingApprovalTools = pendingApprovals.map((approval) => approval.toolName)

  const loadOllamaModels = useCallback(async (baseUrl?: string) => {
    try {
      const result = await sdk.agent.listOllamaModels(baseUrl || undefined)
      setOllamaModels(sanitizeOllamaModels(result.models ?? []))
    } catch {
      setOllamaModels([])
    }
  }, [])

  const syncRuntimeState = useCallback(async () => {
    setRuntimeLoading(true)
    let nextSettings: UserSettings | null = null
    let nextSession: SessionRow | null = null

    try {
      const [settingsResult, sessionsResult, llmKeysResult] = await Promise.allSettled([
        sdk.users.getSettings(),
        sdk.sessions.list({ limit: 200, includeGlobal: true }),
        sdk.users.getLlmKeys(),
      ])

      if (settingsResult.status === 'fulfilled') {
        nextSettings = settingsResult.value
        setRuntimeSettings(nextSettings)
      }

      if (sessionsResult.status === 'fulfilled') {
        const sessionRows = Array.isArray(sessionsResult.value?.sessions)
          ? sessionsResult.value.sessions
          : []
        nextSession = activeConversationId
          ? sessionRows.find((session) => session.id === activeConversationId) ?? null
          : null
        setActiveSession(nextSession)
      } else if (!activeConversationId) {
        setActiveSession(null)
      }

      if (llmKeysResult.status === 'fulfilled') {
        const keyList = Array.isArray(llmKeysResult.value) ? llmKeysResult.value : []
        const ollamaKey = keyList.find((key) => key.provider === 'ollama')
        setOllamaBaseUrl(ollamaKey?.baseUrl?.trim() || '')
        const anyCloudKey = keyList.some((key) => key.provider !== 'ollama' && Boolean(key.apiKey))
        setHasSavedApiKey(anyCloudKey)
      }

      return { settings: nextSettings, session: nextSession }
    } finally {
      setRuntimeLoading(false)
    }
  }, [activeConversationId])

  const appendOperatorMessage = useCallback(
    (content: string, status: Message['status'] = 'done') => {
      setOperatorMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conversationId: activeConversationId ?? '__local__',
          role: 'system',
          content,
          status,
          createdAt: new Date().toISOString(),
        },
      ])
    },
    [activeConversationId],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  useEffect(() => {
    void syncRuntimeState()
  }, [syncRuntimeState])

  useEffect(() => {
    if (activeProvider !== 'ollama') return
    void loadOllamaModels(ollamaBaseUrl || undefined)
  }, [activeProvider, loadOllamaModels, ollamaBaseUrl])

  useEffect(() => {
    onRuntimeLabelChange(formatRuntimeLabel(runtimeSettings, activeSession))
  }, [activeSession, onRuntimeLabelChange, runtimeSettings])

  useEffect(() => {
    setOperatorMessages([])
  }, [activeConversationId])

  useEffect(() => {
    if (!modelPickerOpen) {
      setModelSearchQuery('')
      return
    }
    const updatePosition = () => {
      setIsMobileViewport(window.innerWidth < 640)
      if (modelButtonRef.current) {
        const rect = modelButtonRef.current.getBoundingClientRect()
        setModelPickerAnchor({
          top: rect.bottom + 8,
          left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)),
        })
      }
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelPickerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [modelPickerOpen])

  useEffect(() => {
    if (!mcpDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (mcpPickerRef.current && !mcpPickerRef.current.contains(e.target as Node)) {
        setMcpDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mcpDropdownOpen])

  // When a run finishes, ask the assistant what the user might want next.
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && activeConversationId) {
      const lastAgent = [...messages].reverse().find((m) => m.role === 'agent' && m.status === 'done')
      if (lastAgent && lastAgent.content.trim().length > 40) {
        void sdk.agent
          .suggestions(activeConversationId)
          .then((res) => setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions.slice(0, 3) : []))
          .catch(() => setSuggestions([]))
      } else {
        setSuggestions([])
      }
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, messages, activeConversationId])

  function focusComposer() {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  async function updateRuntimeSettings(provider: RuntimeProvider, model: string, source: string) {
    // Optimistically apply provider & model immediately so mobile/web UI updates without waiting on network
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('openagents.preferred-provider', provider)
      window.localStorage.setItem('openagents.preferred-model', model)
    }
    setRuntimeSettings((prev) => ({
      ...(prev ?? ({} as UserSettings)),
      preferredProvider: provider,
      preferredModel: model,
    }))
    if (activeSession?.model || activeSession?.modelProvider) {
      setActiveSession((prev) => (prev ? { ...prev, model: null, modelProvider: null } : prev))
    }

    setRuntimeBusy(source)
    try {
      const updated = await sdk.users.updateSettings({
        preferredProvider: provider,
        preferredModel: model,
      })
      setRuntimeSettings(updated)
      if (activeConversationId && (activeSession?.model || activeSession?.modelProvider)) {
        await sdk.sessions.patch(activeConversationId, { model: null, modelProvider: null }).catch(() => {})
      }
      await syncRuntimeState()
    } catch {
      // Keep optimistic selection stored in localStorage & state even if backend is temporarily unreachable
    } finally {
      setRuntimeBusy(null)
    }
  }

  async function selectProviderInPicker(nextProvider: RuntimeProvider) {
    const defaultModel = LLM_MODELS[nextProvider]?.default || LLM_MODEL_OPTIONS[nextProvider]?.[0] || 'claude-sonnet-5.5'
    if (modelScope === 'chat' && activeConversationId) {
      setActiveSession((prev) =>
        prev ? { ...prev, modelProvider: nextProvider, model: defaultModel } : prev,
      )
      await patchActiveSession(
        { model: defaultModel, modelProvider: nextProvider },
        `This chat will use ${defaultModel} (${nextProvider}).`,
        'model',
      )
      return
    }
    await updateRuntimeSettings(nextProvider, defaultModel, 'model')
  }

  async function selectModel(model: string) {
    if (modelScope === 'chat' && activeConversationId) {
      setActiveSession((prev) =>
        prev ? { ...prev, model, modelProvider: activeProvider } : prev,
      )
      await patchActiveSession(
        { model, modelProvider: activeProvider },
        `This chat will use ${model} (${activeProvider}). Your default runtime is unchanged.`,
        'model',
      )
      return
    }
    await updateRuntimeSettings(activeProvider, model, 'model')
  }

  async function patchActiveSession(patch: SessionPatchInput, successMessage: string, source: string) {
    if (!activeConversationId) {
      appendOperatorMessage('No active session selected.', 'error')
      return
    }

    setRuntimeBusy(source)
    try {
      await sdk.sessions.patch(activeConversationId, patch)
      await syncRuntimeState()
      appendOperatorMessage(successMessage)
    } catch (err) {
      appendOperatorMessage(formatCommandError(err, 'Failed to update the active session.'), 'error')
    } finally {
      setRuntimeBusy(null)
    }
  }

  async function executeOperatorCommand(rawText: string) {
    const parsed = parseSlashCommand(rawText)
    if (!parsed || !isOperatorCommandId(parsed.id)) return false

    if (parsed.id === 'help') {
      appendOperatorMessage(buildOperatorCommandHelpText())
      return true
    }

    if (parsed.id === 'new') {
      try {
        await onNewSession()
      } catch (err) {
        appendOperatorMessage(formatCommandError(err, 'Failed to start a new session.'), 'error')
      }
      return true
    }

    if (parsed.id === 'status') {
      const snapshot = await syncRuntimeState()
      appendOperatorMessage(
        formatOperatorStatusReport({
          settings: snapshot.settings ?? runtimeSettings,
          session: snapshot.session ?? activeSession,
          activeConversationId,
          pendingApprovals: pendingApprovals.length,
          pendingApprovalTools,
          runStatus,
          messageCount: messages.length,
        }),
      )
      return true
    }

    if (parsed.id === 'approvals') {
      if (pendingApprovals.length === 0) {
        appendOperatorMessage('Approvals\nnone pending for this session.')
        return true
      }

      appendOperatorMessage(
        [
          `Approvals (${pendingApprovals.length})`,
          ...pendingApprovals.map((approval, index) => {
            const risk = approval.risk?.level ? `, ${approval.risk.level} risk` : ''
            return `${index + 1}. ${approval.toolName}${risk}`
          }),
        ].join('\n'),
      )
      return true
    }

    if (parsed.id === 'model') {
      const next = parseModelCommandArg(parsed.arg, activeProvider)
      if (!next) {
        appendOperatorMessage('Usage: /model [provider] <model>', 'error')
        return true
      }
      await updateRuntimeSettings(next.provider, next.model, 'model')
      return true
    }

    if (parsed.id === 'think') {
      const normalized = parsed.arg.trim().toLowerCase()
      const candidate = normalized === 'inherit' ? '' : normalized || ''
      const allowed = new Set<string>(resolveThinkingLevelOptions(sessionProvider))

      if (!candidate) {
        appendOperatorMessage('Usage: /think <inherit|off|minimal|low|medium|high|xhigh|on>', 'error')
        return true
      }

      let displayValue = candidate
      if (!allowed.has(candidate) && !(candidate === 'on' && !binaryThinking)) {
        appendOperatorMessage('Invalid thinking level for the current provider.', 'error')
        return true
      }
      if (candidate === 'on' && !binaryThinking) {
        displayValue = 'low'
      }

      await patchActiveSession(
        { thinkingLevel: resolveThinkingPatchValue(displayValue, binaryThinking) },
        `Thinking level set to ${displayValue}.`,
        'think',
      )
      return true
    }

    if (parsed.id === 'verbose') {
      const normalized = parsed.arg.trim().toLowerCase()
      if (!normalized) {
        appendOperatorMessage('Usage: /verbose <inherit|off|on|full>', 'error')
        return true
      }
      const nextValue = normalized === 'inherit' ? '' : normalized
      if (!VERBOSE_LEVELS.some((option) => option.value === nextValue)) {
        appendOperatorMessage('Invalid verbose level. Use inherit, off, on, or full.', 'error')
        return true
      }

      await patchActiveSession(
        { verboseLevel: nextValue || null },
        `Verbose level set to ${nextValue || 'inherit'}.`,
        'verbose',
      )
      return true
    }

    if (parsed.id === 'reasoning') {
      const normalized = parsed.arg.trim().toLowerCase()
      if (!normalized) {
        appendOperatorMessage('Usage: /reasoning <inherit|off|on|stream>', 'error')
        return true
      }
      const nextValue = normalized === 'inherit' ? '' : normalized
      if (!REASONING_LEVELS.includes(nextValue as (typeof REASONING_LEVELS)[number])) {
        appendOperatorMessage('Invalid reasoning level. Use inherit, off, on, or stream.', 'error')
        return true
      }

      await patchActiveSession(
        { reasoningLevel: nextValue || null },
        `Reasoning visibility set to ${nextValue || 'inherit'}.`,
        'reasoning',
      )
      return true
    }

    if (parsed.id === 'label') {
      if (!parsed.arg.trim()) {
        appendOperatorMessage('Usage: /label <name|clear>', 'error')
        return true
      }
      const nextLabel = ['clear', 'none', 'reset'].includes(parsed.arg.trim().toLowerCase())
        ? null
        : parsed.arg.trim()
      await patchActiveSession(
        { label: nextLabel },
        `Session label ${nextLabel ? `set to "${nextLabel}"` : 'cleared'}.`,
        'label',
      )
      return true
    }

    if (parsed.id === 'compress') {
      if (!activeConversationId) {
        appendOperatorMessage('No active session to compress.', 'error')
        return true
      }
      setRuntimeBusy('compress')
      try {
        const result = await sdk.conversations.compress(activeConversationId)
        appendOperatorMessage(`Context compressed.\n\n${result.summary ?? ''}`)
      } catch (err) {
        appendOperatorMessage(formatCommandError(err, 'Compression failed.'), 'error')
      } finally {
        setRuntimeBusy(null)
      }
      return true
    }

    if (parsed.id === 'personality') {
      const presets = ['concise', 'detailed', 'creative', 'technical', 'professional', 'friendly', 'socratic']
      const value = parsed.arg.trim().toLowerCase()
      if (!value) {
        appendOperatorMessage(`Usage: /personality <preset>\nPresets: ${presets.join(', ')}`, 'error')
        return true
      }
      await patchActiveSession(
        { personality: value === 'clear' || value === 'default' ? null : value },
        `Personality set to "${value === 'clear' || value === 'default' ? 'default' : value}".`,
        'personality',
      )
      return true
    }

    return false
  }

  async function dispatchMessage(rawText: string) {
    const displayContent = rawText.trim()
    if (!displayContent && attachedFiles.length === 0) return

    // Mid-run steering: while the agent is working, fold the new instruction
    // into the active run instead of queueing a separate turn.
    if (isStreaming) {
      if (!displayContent || !activeConversationId) return
      setInput('')
      try {
        await sdk.conversations.steer(activeConversationId, displayContent)
        appendOperatorMessage(`Steering sent: "${displayContent.slice(0, 80)}"`)
      } catch (err) {
        appendOperatorMessage(formatCommandError(err, 'Failed to steer the current run.'), 'error')
      }
      return
    }

    const parsed = displayContent ? parseSlashCommand(displayContent) : null
    if (parsed && isOperatorCommandId(parsed.id)) {
      setSlashQuery(null)
      setMentionQuery(null)
      setInput('')
      await executeOperatorCommand(displayContent)
      return
    }

    // @all 4-Agent Roundtable shortcut inline in chat
    if (displayContent.toLowerCase().startsWith('@all ')) {
      const topic = displayContent.slice(5).trim()
      setMentionQuery(null)
      setInput('')
      if (topic) {
        window.dispatchEvent(new CustomEvent('openagents:open-roundtable', { detail: { topic } }))
      }
    }

    if (!navigator.onLine) {
      const queued = displayContent || '(file attached — queued offline)'
      setOfflineQueue((q) => [...q, queued])
      setInput('')
      setAttachedFiles([])
      return
    }

    if (!gatewayConnected) return

    setSlashQuery(null)
    setMentionQuery(null)
    setInput('')
    setSuggestions([])

    const files = attachedFiles
    setAttachedFiles([])

    const fileBlocks = files.map(buildFileBlock).join('\n\n')
    const userText = displayContent || '(see attached file)'
    const expanded = expandSlashCommand(userText)
    const pinned = buildPinnedContextBlock(pinnedItems)

    const contextPrefix = fileBlocks ? `${fileBlocks}\n\n` : ''
    const content = buildAssistantModePrompt(assistantMode, contextPrefix + expanded + pinned)

    const fileNames = files.length > 0 ? ` [${files.map((f) => f.name).join(', ')}]` : ''
    const displayWithFiles = displayContent ? `${displayContent}${fileNames}` : fileNames.trim()

    if (grokDeepSearchActive && displayContent) {
      void sdk.agenticSuite
        .runGrokDeepSearch({ query: displayContent, bigBrainEnabled: bigBrainActive })
        .then((res) => {
          appendOperatorMessage(
            `🔍 Grok DeepSearch (${res.confidenceScore}% confidence • ${res.durationMs}ms):\n${res.thinkingTrace.join('\n')}\n\n⚡ Contrarian Check: ${res.contrarianTake}`,
          )
        })
        .catch(() => {})
    }

    const effectiveEffort =
      effort !== 'auto'
        ? effort
        : bigBrainActive
          ? 'planned'
          : undefined

    await sendMessage(content, {
      displayContent: displayWithFiles || displayContent,
      mode: assistantMode,
      ...(effectiveEffort ? { effort: effectiveEffort } : {}),
    })
  }

  async function handleSend() {
    await dispatchMessage(input)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    // reset input so same file can be re-attached if removed
    e.target.value = ''
    const results = await Promise.allSettled(files.map(readFileAsAttachment))
    const loaded = results
      .filter((r): r is PromiseFulfilledResult<AttachedFile> => r.status === 'fulfilled')
      .map((r) => r.value)
    setAttachedFiles((prev) => [...prev, ...loaded])
  }

  async function handleQuickPrompt(prompt: string) {
    await dispatchMessage(prompt)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    const slashMatch = val.match(/^(\/[a-z]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1])
      setMentionQuery(null)
      return
    }
    setSlashQuery(null)
    const mentionMatch = val.match(/(?:^|\s)@([a-zA-Z]*)$/)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1] ?? '')
    } else {
      setMentionQuery(null)
    }
  }

  const ghostSuggestion = useMemo(() => {
    const trimmed = input.trim()
    if (trimmed.length < 4 || trimmed.startsWith('/') || isStreaming) return ''
    const lower = trimmed.toLowerCase()
    if (/news|headline|latest|today|market/.test(lower) && !lower.includes('citations')) {
      return ' with live source citations and recency timestamps'
    }
    if (/bug|fix|error|slow|latency|optimize/.test(lower) && !lower.includes('verify')) {
      return ' across apps/api and apps/web and verify zero regressions'
    }
    if (/deploy|ship|cloudflare|github/.test(lower) && !lower.includes('openagents.us')) {
      return ' to GitHub origin/main and deploy live to https://openagents.us'
    }
    if (trimmed.length < 45 && !trimmed.endsWith('.')) {
      return ' and summarize the key actionable takeaways'
    }
    return ''
  }, [input, isStreaming])

  function handleKey(e: React.KeyboardEvent) {
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
      return
    }
    if (e.key === 'Tab' && ghostSuggestion) {
      e.preventDefault()
      setInput((prev) => `${prev.trimEnd()}${ghostSuggestion}`)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handlePresetApply(template: string) {
    setInput((current) => current.trim() ? `${current.trim()}\n\n${template}` : template)
    focusComposer()
  }

  function handleAddPin(item: Omit<PinnedItem, 'id'>) {
    setPinnedItems((prev) => [...prev, { ...item, id: `pin-${Date.now()}` }])
  }

  function handleRemovePin(id: string) {
    setPinnedItems((prev) => prev.filter((p) => p.id !== id))
  }

  const inputIsCommand = input.trim().startsWith('/')
  const isRuntimeCustomized = Boolean(
    activeSession?.label?.trim() ||
    activeSession?.thinkingLevel?.trim() ||
    activeSession?.verboseLevel?.trim() ||
    activeSession?.reasoningLevel?.trim() ||
    activeSession?.model?.trim() ||
    activeSession?.modelProvider?.trim(),
  )
  const assistantStatusText = isStreaming
    ? (runStatus === 'running_tool'
        ? 'OpenAgents is executing tools...'
        : runStatus === 'planning'
          ? 'OpenAgents is planning...'
          : runStatus === 'verifying'
            ? 'OpenAgents is finalizing...'
            : 'OpenAgents is thinking...')
    : runtimeBusy
        ? 'Updating runtime...'
        : 'OpenAgents ready'
  const sessionLabel = activeSession?.label?.trim() || 'main'
  const runtimeSummary = `${effectiveRuntime.model} / ${effectiveProviderLabel}`
  const runtimeBadgeLabel = isRuntimeCustomized ? 'Session override' : 'Default runtime'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/60 shadow-[0_2px_4px_rgba(15,23,42,0.03),0_24px_64px_-24px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-[#2d3347] dark:bg-[#10141f]/60">
      {isOffline && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          Offline — messages queue locally and send automatically when you reconnect.
          {offlineQueue.length > 0 && <span className="rounded-full bg-amber-200 px-2 py-0.5">{offlineQueue.length} queued</span>}
        </div>
      )}
      <div className="relative z-30 flex items-center justify-between gap-2 border-b border-slate-200/60 bg-white/75 px-3 py-2.5 backdrop-blur-xl dark:border-[#2d3347] dark:bg-[#141824]/75 sm:px-6 sm:py-3">
        {/* Left: mobile menu + model select */}
        <div ref={modelPickerRef} className="relative z-10 flex min-w-0 items-center gap-1.5">
          {onOpenMobileSessions && (
            <button
              type="button"
              onClick={onOpenMobileSessions}
              className="oa-pill-btn h-8 w-8 shrink-0 border border-[#e4e7ec] bg-white text-[#667085] md:hidden dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
              title="Open Workspace & Sessions"
              aria-label="Open Workspace & Sessions"
            >
              <Menu size={15} />
            </button>
          )}
          <button
            ref={modelButtonRef}
            type="button"
            onClick={() => setModelPickerOpen((o) => !o)}
            disabled={Boolean(runtimeBusy) || runtimeLoading}
            className={clsx(
              'oa-model-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] sm:text-[13px] font-medium text-[#475467] transition hover:text-[#101828] dark:text-[#a1a1aa] dark:hover:text-white',
              (Boolean(runtimeBusy) || runtimeLoading) && 'opacity-50 cursor-not-allowed',
            )}
            title="Switch AI model"
          >
            <span className="max-w-[100px] truncate sm:max-w-[220px]">{inUseModel.split('/').pop() || inUseModel}</span>
            <ChevronDown size={14} className={clsx('shrink-0 transition-transform', modelPickerOpen ? 'rotate-180' : '')} />
          </button>

          {modelPickerOpen &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/45 p-2.5 backdrop-blur-[2px] sm:block sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setModelPickerOpen(false)
                }}
              >
                <div
                  style={
                    !isMobileViewport && modelPickerAnchor
                      ? {
                          position: 'fixed',
                          top: `${Math.min(modelPickerAnchor.top, window.innerHeight - 480)}px`,
                          left: `${modelPickerAnchor.left}px`,
                          width: '340px',
                        }
                      : undefined
                  }
                  className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-[22px] border border-[#e4e7ec] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.28)] sm:max-h-[460px] sm:rounded-[18px] dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#f2f4f7] px-4 py-3 dark:border-[#2d3347]">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">
                        Model ({providerModelOptions.length})
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-full bg-[#f2f4f7] p-0.5 dark:bg-[#232837]">
                        <button
                          type="button"
                          onClick={() => setModelScope('global')}
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold transition',
                            modelScope === 'global'
                              ? 'bg-white text-[#101828] shadow-sm dark:bg-[#141824] dark:text-white'
                              : 'text-[#98a2b3] hover:text-[#475467]',
                          )}
                        >
                          All chats
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelScope('chat')}
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold transition',
                            modelScope === 'chat'
                              ? 'bg-white text-[#101828] shadow-sm dark:bg-[#141824] dark:text-white'
                              : 'text-[#98a2b3] hover:text-[#475467]',
                          )}
                        >
                          This chat
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModelPickerOpen(false)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 dark:bg-[#232837] dark:text-slate-400"
                        aria-label="Close model picker"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Provider quick-switcher pills */}
                  <div className="flex items-center gap-1 overflow-x-auto border-b border-[#f2f4f7] px-3 py-2 no-scrollbar dark:border-[#2d3347]">
                    {(
                      [
                        { id: 'apisrouter', label: 'APIsRouter (93+)' },
                        { id: 'anthropic', label: 'Anthropic' },
                        { id: 'openai', label: 'OpenAI' },
                        { id: 'google', label: 'Gemini' },
                        { id: 'deepseek', label: 'DeepSeek' },
                        { id: 'xai', label: 'Grok' },
                        { id: 'groq', label: 'Groq' },
                        { id: 'ollama', label: 'Ollama' },
                      ] as Array<{ id: RuntimeProvider; label: string }>
                    ).map((prov) => {
                      const active = activeProvider === prov.id
                      return (
                        <button
                          key={prov.id}
                          type="button"
                          onClick={() => void selectProviderInPicker(prov.id)}
                          className={clsx(
                            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                            active
                              ? 'bg-rose-500 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#232837] dark:text-slate-300',
                          )}
                        >
                          {prov.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Search bar inside model picker */}
                  <div className="border-b border-[#f2f4f7] px-3 py-2 dark:border-[#2d3347]">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 dark:bg-[#141824]">
                      <Search size={13} className="shrink-0 text-slate-400" />
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder={`Search ${providerModelOptions.length} models...`}
                        className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                      />
                      {modelSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setModelSearchQuery('')}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {modelScope === 'chat' && (
                    <p className="border-b border-[#f2f4f7] bg-[#fffbeb] px-4 py-1.5 text-[10px] text-[#92400e] dark:border-[#2d3347] dark:bg-[#1c1917] dark:text-[#fbbf24]">
                      {activeSession?.model ? (
                        <>
                          This chat uses <span className="font-semibold">{activeSession.model}</span>.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              void patchActiveSession(
                                { model: null, modelProvider: null },
                                'This chat now follows your default model.',
                                'model',
                              )
                            }}
                            className="underline underline-offset-2"
                          >
                            Reset
                          </button>
                        </>
                      ) : (
                        'Picks below apply to this chat only.'
                      )}
                    </p>
                  )}

                  {/* Model list — favorites first, active model marked in use */}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
                    {favoriteOptions.length > 0 && (
                      <>
                        <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">
                          Favorites
                        </p>
                        {favoriteOptions.map((model) => (
                          <ModelRow
                            key={`fav-${model}`}
                            model={model}
                            inUse={inUseModel === model}
                            favorite
                            onToggleFavorite={() => toggleFavoriteModel(model)}
                            onSelect={() => {
                              void selectModel(model)
                              setModelPickerOpen(false)
                            }}
                          />
                        ))}
                        <div className="mx-3 my-1 border-t border-[#f2f4f7] dark:border-[#2d3347]" />
                      </>
                    )}
                    <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">
                      {favoriteOptions.length > 0 ? 'All models' : 'Models'}
                    </p>
                    {nonFavoriteOptions.map((model) => (
                      <ModelRow
                        key={model}
                        model={model}
                        inUse={inUseModel === model}
                        favorite={false}
                        onToggleFavorite={() => toggleFavoriteModel(model)}
                        onSelect={() => {
                          void selectModel(model)
                          setModelPickerOpen(false)
                        }}
                      />
                    ))}
                    {filteredProviderModelOptions.length === 0 && (
                      <p className="px-3 py-4 text-center text-[12px] text-[#98a2b3]">
                        No models match &ldquo;{modelSearchQuery.trim()}&rdquo;.
                      </p>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </div>

        {/* Center: Muse Personal Agent Identity + Live Status Pill */}
        <div className="relative z-20 hidden sm:flex flex-col items-center justify-center">
          <button
            type="button"
            onClick={() => setPersonaPickerOpen((o) => !o)}
            className="group flex items-center gap-2 rounded-full px-2.5 py-1 transition hover:bg-slate-100/80 dark:hover:bg-white/5"
            title="Customize your personal AI agent"
          >
            <div className="oa-avatar-ring-gradient">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${agentPersona.aura} text-[11px] font-black text-white shadow-sm`}
              >
                {(agentPersona.name[0] || 'V').toUpperCase()}
              </div>
            </div>
            <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">
              {agentPersona.name}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {assistantModeDefinition.label}
            </span>
          </button>

          {/* Live Status Pill (3rd Layer: Shared Computer & Transparency Drawer) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('openagents:show-activity'))
              window.dispatchEvent(new CustomEvent('openagents:open-computer'))
            }}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm transition hover:border-rose-300 hover:text-slate-900 dark:border-[#2d3347] dark:bg-[#141824]/90 dark:text-slate-300"
            title="Click to open Shared Computer, Live Browser & Time-Travel Undo Drawer"
          >
            <span
              className={clsx(
                'h-1.5 w-1.5 rounded-full',
                isStreaming ? 'bg-amber-500 animate-ping' : 'bg-emerald-500',
              )}
            />
            <span>
              {isStreaming
                ? assistantStatusText.replace('OpenAgents', agentPersona.name)
                : `${agentPersona.name} is ready & listening`}
            </span>
          </button>

          {personaPickerOpen && (
            <div className="absolute top-full mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                Personalize Your OpenAgent
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                &ldquo;Your purpose is to make your user&rsquo;s life better.&rdquo;
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[
                  {
                    name: 'Veda',
                    aura: 'from-rose-500 to-orange-500',
                    style: 'Warm, proactive & organized',
                  },
                  {
                    name: 'Nova',
                    aura: 'from-amber-500 to-rose-500',
                    style: 'Calm, thoughtful & creative',
                  },
                  {
                    name: 'Atlas',
                    aura: 'from-emerald-500 to-teal-600',
                    style: 'Direct, analytical & fast',
                  },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      updateAgentPersona(preset)
                      setPersonaPickerOpen(false)
                    }}
                    className={clsx(
                      'flex flex-col items-center rounded-xl border p-2 text-center transition',
                      agentPersona.name === preset.name
                        ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/10'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-[#2d3347] dark:hover:bg-white/5',
                    )}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${preset.aura} text-[10px] font-bold text-white`}
                    >
                      {preset.name[0]}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#2d3347]">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Or custom agent name:
                </label>
                <input
                  type="text"
                  value={agentPersona.name}
                  onChange={(e) =>
                    updateAgentPersona({
                      ...agentPersona,
                      name: e.target.value || 'Veda',
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: New Chat + mobile/tablet activity drawer */}
        <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-1.5">
          {onNewSession && (
            <button
              type="button"
              onClick={() => void onNewSession()}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:bg-white sm:h-auto sm:gap-1.5 sm:px-3 sm:py-1 dark:border-[#2d3347] dark:bg-[#1a2032]/80 dark:text-slate-300"
              title="Start a New Chat Session"
            >
              <Plus size={12} />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('openagents:show-activity'))}
            className="oa-pill-btn h-8 w-8 border border-[#e4e7ec] bg-white text-[#667085] xl:hidden dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
            title="Open Activity & Goals"
            aria-label="Open Activity & Goals"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>

      {visibleMessages.length === 0 ? (
        /* ── OpenAgents Personal AI Agent Empty State ── */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start sm:justify-center overflow-y-auto bg-transparent px-3 py-4 sm:px-4 sm:py-8">
          {/* Live Telemetry & Directive Pill Bar */}
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:mb-3 sm:gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              <Sparkles size={11} />
              &ldquo;Your purpose is to make your user&rsquo;s life better.&rdquo;
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Brain: {inUseModel.split('/').pop() || inUseModel}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center text-center gap-1 mb-3.5 sm:gap-1.5 sm:mb-5">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div
                className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-gradient-to-br ${agentPersona.aura} text-xs sm:text-sm font-black text-white shrink-0 shadow-md`}
              >
                {(agentPersona.name[0] || 'V').toUpperCase()}
              </div>
              <h1 className="oa-gradient-text text-lg font-extrabold tracking-tight sm:text-4xl">
                Hi, I&rsquo;m {agentPersona.name}. What can I get done for you?
              </h1>
            </div>
            <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              {agentPersona.style} • {assistantModeDefinition.description}
            </p>
          </div>

          {/* Mode Selector Tabs (Assist / Plan / Execute / Autopilot) */}
          <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-[#2d3347] dark:bg-[#141824]/90">
            {ASSISTANT_MODE_DEFINITIONS.map((def) => {
              const active = def.id === assistantMode
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => onAssistantModeChange(def.id)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition',
                    active
                      ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )}
                >
                  <span>{def.label}</span>
                  <span
                    className={clsx(
                      'hidden sm:inline text-[10px] font-normal',
                      active ? 'text-white/85' : 'text-slate-400 dark:text-slate-500',
                    )}
                  >
                    • {def.caption}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Input card */}
          <div className="relative w-full max-w-2xl">
            {hasSavedApiKey === false && (
              <div className="mb-3 flex flex-col gap-2.5 rounded-2xl border border-violet-300/70 bg-gradient-to-r from-violet-950/95 via-slate-900/95 to-fuchsia-950/95 p-3.5 text-white shadow-md sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-fuchsia-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                      Step 1: Connect API Key
                    </span>
                    <a
                      href="https://apisrouter.dev/?ref=openagents"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-bold text-fuchsia-300 underline underline-offset-2 hover:text-white"
                    >
                      Get 1 Key for 93+ Models at APIsRouter.dev ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => router.push('/settings/config')}
                      className="text-[11px] font-medium text-slate-300 underline underline-offset-2 hover:text-white"
                    >
                      or Bring Your Own Key →
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">
                    Your OpenAgents cloud workspace is 100% free. Paste your <code className="font-mono text-fuchsia-200">apisrouter.dev</code> key below to activate Veda:
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="password"
                    name="oa-chat-quick-key"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={quickApiKeyInput}
                    onChange={(e) => setQuickApiKeyInput(e.target.value)}
                    placeholder="apr-sk-live-..."
                    className="h-8 w-40 rounded-lg border border-white/20 bg-white/10 px-2.5 text-xs text-white placeholder-slate-400 outline-none focus:border-fuchsia-400 sm:w-44"
                  />
                  <button
                    type="button"
                    disabled={isSavingQuickKey || !quickApiKeyInput.trim()}
                    onClick={async () => {
                      const trimmed = quickApiKeyInput.trim()
                      if (!trimmed) return
                      setIsSavingQuickKey(true)
                      try {
                        await sdk.users.upsertLlmKey('apisrouter', { apiKey: trimmed, isActive: true })
                        await sdk.users.updateSettings({
                          preferredProvider: 'apisrouter',
                          preferredModel: 'claude-sonnet-5.5',
                        })
                        setQuickApiKeyInput('')
                        setHasSavedApiKey(true)
                        await syncRuntimeState()
                      } catch {
                        router.push('/settings/config')
                      } finally {
                        setIsSavingQuickKey(false)
                      }
                    }}
                    className="h-8 shrink-0 rounded-lg bg-fuchsia-500 px-3 text-xs font-bold text-white transition hover:bg-fuchsia-400 disabled:opacity-50"
                  >
                    {isSavingQuickKey ? 'Saving...' : 'Activate'}
                  </button>
                </div>
              </div>
            )}
            {slashQuery !== null && (
              <SlashCommandPalette
                query={slashQuery}
                onSelect={(cmd) => { setInput(cmd.template); setSlashQuery(null); focusComposer() }}
                onClose={() => setSlashQuery(null)}
              />
            )}

            {mentionQuery !== null && (
              <div className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Route to Specialist or @all Roundtable
                </p>
                <div className="space-y-1">
                  {SPECIALIST_OPTIONS.filter((opt) =>
                    opt.handle.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                    opt.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                  ).map((opt) => (
                    <button
                      key={opt.handle}
                      type="button"
                      onClick={() => {
                        setInput((prev) => prev.replace(/(?:^|\s)@[a-zA-Z]*$/, ` ${opt.promptPrefix}`).trimStart())
                        setMentionQuery(null)
                        focusComposer()
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg bg-gradient-to-r ${opt.badge} px-2 py-0.5 text-[10px] font-black text-white`}>
                          {opt.handle}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">{opt.role}</span>
                      </div>
                      <span className="truncate text-[11px] text-slate-400">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="oa-composer overflow-hidden">
              {/* File chips */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pt-4">
                  {attachedFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] px-2 py-1 text-[11px] text-[#344054] dark:border-[#2d3347] dark:bg-[#141824]">
                      {file.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.content} alt={file.name || 'Attached chat image preview'} className="h-5 w-5 rounded object-cover" />
                      ) : (
                        <Paperclip size={11} className="shrink-0 text-[#98a2b3]" />
                      )}
                      <span className="max-w-[140px] truncate">{file.name}</span>
                      <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))} className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-[#98a2b3] hover:text-[#344054]" aria-label={`Remove ${file.name}`}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                disabled={isStreaming}
                rows={3}
                placeholder={assistantModeDefinition.placeholder}
                className="max-h-48 min-h-[88px] w-full resize-none bg-transparent px-5 pt-4 text-[15px] text-[#101828] outline-none placeholder:text-[#98a2b3] disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
              />

              <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-[#f2f4f7] px-4 py-2.5 dark:border-[#2d3347]">
                {/* Left: attach + badge pills */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} accept="*/*" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e7ec] bg-white text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                    title="Attach files"
                  >
                    <Plus size={14} />
                  </button>

                  <div ref={mcpPickerRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMcpDropdownOpen((o) => !o)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                      <span>MCP</span>
                      <ChevronDown size={10} className={clsx('transition-transform', mcpDropdownOpen ? 'rotate-180' : '')} />
                    </button>

                    {mcpDropdownOpen && (
                      <div className="absolute left-0 bottom-full z-50 mb-2 w-[min(14rem,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-lg dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                        <p className="text-[11px] font-semibold text-[#10b981] mb-2">Model Context Protocol</p>
                        <p className="text-[11px] text-[#667085] dark:text-[#a1a1aa]">Connect MCP tool servers (filesystem, browser, dev tools) with the OpenAgents desktop app. Cloud chat uses your selected model directly.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: mic + green send button */}
                <div className="flex items-center gap-2">
                  <WebRtcVoiceControls />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={(!input.trim() && attachedFiles.length === 0) || (isStreaming && !input.trim()) || (!gatewayConnected && !inputIsCommand && attachedFiles.length === 0)}
                    className="oa-send-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
                    aria-label="Send message"
                  >
                    <ArrowUp size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Specialist Quick-Dispatch Cards */}
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                {
                  agent: '@Forge',
                  role: 'Coder & Architect',
                  badgeClass: 'from-rose-500 to-orange-500',
                  title: 'Design a Feature End-to-End',
                  prompt: 'Delegate to @Forge: Help me design a new feature for my product. Ask me 3 quick questions, then give me the data model, API endpoints, and a step-by-step build plan.',
                },
                {
                  agent: '@Scout',
                  role: 'Deep Researcher',
                  badgeClass: 'from-cyan-500 to-blue-600',
                  title: 'Run Deep Web & Tech Research',
                  prompt: 'Delegate to @Scout: Research the current state-of-the-art in autonomous coding agents and MCP tool architectures, and give me a structured summary.',
                },
                {
                  agent: '@Sentinel',
                  role: 'Writer & Editor',
                  badgeClass: 'from-emerald-500 to-teal-600',
                  title: 'Draft a Viral X Post',
                  prompt: 'Delegate to @Sentinel: Write 3 punchy X posts announcing my product launch, each under 280 characters, with a strong hook and a clear call to action.',
                },
                {
                  agent: '@Atlas',
                  role: 'Chief of Staff',
                  badgeClass: 'from-amber-500 to-rose-500',
                  title: 'Decompose Goal into Milestones',
                  prompt: 'Delegate to @Atlas: Turn my biggest goal this month into an actionable 7-day plan with daily milestones and a way to check progress.',
                },
              ].map((card) => (
                <button
                  key={card.agent}
                  type="button"
                  onClick={() => {
                    onAssistantModeChange('autopilot')
                    void handleQuickPrompt(card.prompt)
                  }}
                  className="oa-suggestion group flex flex-col justify-between p-3.5 text-left"
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className={`inline-flex items-center rounded-lg bg-gradient-to-r ${card.badgeClass} px-2 py-0.5 text-[10px] font-black text-white`}>
                      {card.agent}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {card.role} →
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-800 group-hover:text-rose-600 dark:text-slate-100 dark:group-hover:text-rose-400">
                    {card.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {card.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Active chat — messages + bottom input bar ── */
        <>
          <div className="oa-scroll-panel min-h-0 flex-1 overflow-y-auto bg-transparent px-4 py-4 sm:px-7">
            <div className="mx-auto w-full max-w-[980px] space-y-6 pb-6 pt-2">
              {visibleMessages.map((message, idx) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  conversationId={activeConversationId ?? undefined}
                  messageIndex={idx + 1}
                  isLast={idx === visibleMessages.length - 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {plan && (
            <div className="px-4 pb-2 sm:px-7">
              <PlanChecklist plan={plan} onDismiss={clearPlan} />
            </div>
          )}

          {!isStreaming && (
            <div className="px-4 sm:px-7">
              <SuggestionChips suggestions={suggestions} onPick={(text) => void dispatchMessage(text)} />
            </div>
          )}

          <div className="border-t border-slate-200/70 bg-white/70 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-[#2d3347] dark:bg-[#141824]/70 sm:px-6">
            {slashQuery !== null && (
              <SlashCommandPalette
                query={slashQuery}
                onSelect={(cmd) => { setInput(cmd.template); setSlashQuery(null); focusComposer() }}
                onClose={() => setSlashQuery(null)}
              />
            )}

            {mentionQuery !== null && (
              <div className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Route to Specialist or @all Roundtable
                </p>
                <div className="space-y-1">
                  {SPECIALIST_OPTIONS.filter((opt) =>
                    opt.handle.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                    opt.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                  ).map((opt) => (
                    <button
                      key={opt.handle}
                      type="button"
                      onClick={() => {
                        setInput((prev) => prev.replace(/(?:^|\s)@[a-zA-Z]*$/, ` ${opt.promptPrefix}`).trimStart())
                        setMentionQuery(null)
                        focusComposer()
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg bg-gradient-to-r ${opt.badge} px-2 py-0.5 text-[10px] font-black text-white`}>
                          {opt.handle}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">{opt.role}</span>
                      </div>
                      <span className="truncate text-[11px] text-slate-400">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] px-2 py-1 text-[11px] text-[#344054] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#c9d1e0]">
                    {file.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.content} alt={file.name || 'Attached chat image preview'} className="h-5 w-5 rounded object-cover" />
                    ) : (
                      <Paperclip size={11} className="shrink-0 text-[#98a2b3]" />
                    )}
                    <span className="max-w-[140px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))} className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-[#98a2b3] hover:text-[#344054]" aria-label={`Remove ${file.name}`}>x</button>
                  </div>
                ))}
              </div>
            )}

            <div className="oa-composer overflow-hidden">
              {ghostSuggestion && (
                <div className="flex items-center justify-between gap-2 border-b border-sky-500/15 bg-sky-500/[0.04] px-3.5 py-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="truncate">
                    <span className="mr-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-sky-600 dark:text-sky-300">
                      ⚡ Speculative Pre-Warm
                    </span>
                    <span className="italic text-slate-400 dark:text-slate-500">…{ghostSuggestion}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => `${prev.trimEnd()}${ghostSuggestion}`)
                      focusComposer()
                    }}
                    className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200"
                  >
                    Tab ↹
                  </button>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                rows={1}
                placeholder={isStreaming ? 'Steer the current run…' : 'Ask anything'}
                className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-4 pt-4 text-base text-[#101828] outline-none placeholder:text-[#a1a1aa] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm dark:text-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-[#f2f4f7] px-3 py-2.5 dark:border-[#2d3347]">
                {/* Left: attach + MCP */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} accept="*/*" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e7ec] bg-white text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                    title="Attach files"
                  >
                    <Plus size={14} />
                  </button>

                  <div ref={mcpPickerRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMcpDropdownOpen((o) => !o)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                      <span>MCP</span>
                      <ChevronDown size={10} className={clsx('transition-transform', mcpDropdownOpen ? 'rotate-180' : '')} />
                    </button>

                    {mcpDropdownOpen && (
                      <div className="absolute left-0 bottom-full z-50 mb-2 w-[min(14rem,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-lg dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                        <p className="text-[11px] font-semibold text-[#10b981] mb-2">Model Context Protocol</p>
                        <p className="text-[11px] text-[#667085] dark:text-[#a1a1aa]">Connect MCP tool servers (filesystem, browser, dev tools) with the OpenAgents desktop app. Cloud chat uses your selected model directly.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: mic + green send button */}
                <div className="flex items-center gap-2">
                  <WebRtcVoiceControls />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={(!input.trim() && attachedFiles.length === 0) || (isStreaming && !input.trim()) || (!gatewayConnected && !inputIsCommand && attachedFiles.length === 0)}
                    className="oa-send-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
                    aria-label="Send message"
                  >
                    <ArrowUp size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
