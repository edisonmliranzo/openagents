'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { ResponsePresets } from './ResponsePresets'
import {
  AlertTriangle,
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Command,
  Gauge,
  Mic,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  User,
} from 'lucide-react'

interface ChatWindowProps {
  assistantMode: AssistantMode
  onAssistantModeChange: (mode: AssistantMode) => void
  gatewayConnected: boolean
  onNewSession: () => Promise<void> | void
  onRuntimeLabelChange: (label: string) => void
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
  return 'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--tone-inverse)]'
}

function getDefaultRuntime(settings?: Pick<UserSettings, 'preferredProvider' | 'preferredModel'> | null) {
  return {
    provider: settings?.preferredProvider?.trim() || 'default',
    model: settings?.preferredModel?.trim() || 'default model',
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
  activeHandoffStatus: string | null
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
    `handoff: ${args.activeHandoffStatus ?? 'none'}`,
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
      `data:${file.mimeType};base64 below:`,
      file.content,
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
}: ChatWindowProps) {
  const {
    messages,
    sendMessage,
    isStreaming,
    activeConversationId,
    learnedSkill,
    runStatus,
    pendingApprovals,
    activeHandoff,
    escalateToHuman,
  } = useChatStore()
  const [input, setInput] = useState('')
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<UserSettings | null>(null)
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('')
  const [operatorMessages, setOperatorMessages] = useState<Message[]>([])
  const [controlsExpanded, setControlsExpanded] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const learnedIntentLabel = formatIntentLabel(learnedSkill?.intent)
  const beginnerMode = Boolean(runtimeSettings?.beginnerMode)
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )
  const activeHandoffStatus =
    activeHandoff && (activeHandoff.status === 'open' || activeHandoff.status === 'claimed')
      ? activeHandoff.status
      : null

  const visibleMessages = useMemo(
    () =>
      [...messages, ...operatorMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages, operatorMessages],
  )

  const activeProvider = useMemo(() => {
    const normalized = normalizeProviderId(runtimeSettings?.preferredProvider)
    return isRuntimeProvider(normalized) ? normalized : 'anthropic'
  }, [runtimeSettings?.preferredProvider])
  const effectiveRuntime = useMemo(
    () => getEffectiveRuntime(runtimeSettings, activeSession),
    [runtimeSettings, activeSession],
  )
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
        : [...LLM_MODEL_OPTIONS[activeProvider]]

      return withCurrentOption(
        baseOptions,
        runtimeSettings?.preferredModel?.trim() || LLM_MODELS[activeProvider].default,
      )
    },
    [activeProvider, ollamaModels, runtimeSettings?.preferredModel],
  )

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
        const ollamaKey = (llmKeysResult.value ?? []).find((key) => key.provider === 'ollama')
        setOllamaBaseUrl(ollamaKey?.baseUrl?.trim() || '')
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

  function focusComposer() {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  async function updateRuntimeSettings(provider: RuntimeProvider, model: string, source: string) {
    setRuntimeBusy(source)
    try {
      const runtimeTest = await sdk.agent.testLlmConnection({
        provider,
        model,
        ...(provider === 'ollama' && ollamaBaseUrl.trim() ? { baseUrl: ollamaBaseUrl.trim() } : {}),
      })
      if (!runtimeTest.ok) {
        appendOperatorMessage(
          normalizeRuntimeTestError(
            runtimeTest.error,
            `Failed to switch runtime to ${provider} / ${model}.`,
          ),
          'error',
        )
        return
      }

      const updated = await sdk.users.updateSettings({
        preferredProvider: provider,
        preferredModel: model,
      })
      setRuntimeSettings(updated)
      await syncRuntimeState()
      appendOperatorMessage(`Runtime updated to ${provider} / ${model}.`)
    } catch (err) {
      appendOperatorMessage(formatCommandError(err, 'Failed to update the runtime model.'), 'error')
    } finally {
      setRuntimeBusy(null)
    }
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
          activeHandoffStatus,
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

    if (parsed.id === 'human') {
      if (!activeConversationId) {
        appendOperatorMessage('No active session selected.', 'error')
        return true
      }
      if (activeHandoffStatus) {
        appendOperatorMessage(`This session is already in human handoff mode (${activeHandoffStatus}).`, 'error')
        return true
      }

      try {
        await escalateToHuman(
          parsed.arg || `Operator requested from ${assistantModeDefinition.label.toLowerCase()} mode.`,
        )
        appendOperatorMessage('Escalated the current session to a human operator.')
      } catch (err) {
        appendOperatorMessage(formatCommandError(err, 'Failed to escalate the current session.'), 'error')
      }
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

    return false
  }

  async function dispatchMessage(rawText: string) {
    const displayContent = rawText.trim()
    if (!displayContent && attachedFiles.length === 0) return
    if (isStreaming) return

    const parsed = displayContent ? parseSlashCommand(displayContent) : null
    if (parsed && isOperatorCommandId(parsed.id)) {
      setSlashQuery(null)
      setInput('')
      await executeOperatorCommand(displayContent)
      return
    }

    if (!gatewayConnected) return

    setSlashQuery(null)
    setInput('')

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

    await sendMessage(content, { displayContent: displayWithFiles || displayContent })
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

  async function handleEscalate() {
    if (!activeConversationId || isStreaming || activeHandoffStatus) return
    await escalateToHuman(`Operator requested from ${assistantModeDefinition.label.toLowerCase()} mode.`)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    const slashMatch = val.match(/^(\/[a-z]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1])
    } else {
      setSlashQuery(null)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
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
    ? 'OpenAgents is working...'
    : activeHandoffStatus
      ? `Waiting on a human operator (${activeHandoffStatus}).`
      : runtimeBusy
        ? 'Updating runtime...'
        : 'OpenAgents ready'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[#e4e7ec] bg-white shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
      <div className="border-b border-[#eceef4] bg-white px-4 py-4 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[#f2d5d2] bg-[#fff7f5] px-2.5 py-1.5 text-[#101828] shadow-sm">
              <div className="oa-brand-badge flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white">
                OA
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">
                  OpenAgents
                </p>
                <p className="text-[13px] font-semibold leading-none text-[#101828]">Chat</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onNewSession()}
              className="rounded-[14px] border border-[#e4e7ec] bg-white px-4 py-2 text-left text-[15px] font-medium text-[#101828] shadow-sm transition hover:border-[#d0d5dd] hover:bg-[#fbfbfd]"
            >
              {activeSession?.label?.trim() || 'main'}
            </button>
            <button
              type="button"
              onClick={() => setControlsExpanded((current) => !current)}
              className="rounded-[14px] border border-[#e4e7ec] bg-white px-4 py-2 text-left text-[14px] text-[#667085] shadow-sm transition hover:border-[#d0d5dd] hover:bg-[#fbfbfd]"
            >
              {effectiveRuntime.model} · {effectiveProviderLabel}
            </button>
            <button
              type="button"
              onClick={() => setControlsExpanded((current) => !current)}
              className="rounded-[14px] border border-[#e4e7ec] bg-white px-4 py-2 text-left text-[14px] text-[#667085] shadow-sm transition hover:border-[#d0d5dd] hover:bg-[#fbfbfd]"
            >
              {isRuntimeCustomized ? 'Session override' : 'Default runtime'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void syncRuntimeState()}
              disabled={runtimeLoading}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#e4e7ec] bg-white text-[#667085] shadow-sm transition hover:border-[#d0d5dd] hover:bg-[#fbfbfd] disabled:opacity-50"
              title="Refresh runtime"
            >
              <RefreshCw size={16} />
            </button>
            <span className="hidden h-7 w-px bg-[#eceef4] sm:block" />
            <button
              type="button"
              onClick={() => setControlsExpanded((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#f2b7b2] bg-[#fff8f7] text-[#ef4444] shadow-sm transition hover:bg-[#fff1ef]"
              title={controlsExpanded ? 'Hide details' : 'Show details'}
            >
              {controlsExpanded ? <ChevronUp size={16} /> : <BrainCircuit size={16} />}
            </button>
            <button
              type="button"
              onClick={() => void executeOperatorCommand('/approvals')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#f2b7b2] bg-[#fff8f7] text-[#ef4444] shadow-sm transition hover:bg-[#fff1ef]"
              title="Approvals"
            >
              <ShieldCheck size={16} />
            </button>
            <button
              type="button"
              onClick={focusComposer}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#e4e7ec] bg-white text-[#667085] shadow-sm transition hover:border-[#d0d5dd] hover:bg-[#fbfbfd]"
              title="Focus composer"
            >
              <Command size={16} />
            </button>
            <button
              type="button"
              onClick={() => void onNewSession()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#f2b7b2] bg-[#fff8f7] text-[#ef4444] shadow-sm transition hover:bg-[#fff1ef]"
              title="New session"
            >
              <MessageSquarePlus size={16} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full border px-3 py-1 font-semibold ${statusChipClass(runStatus, isStreaming)}`}>
            {runStatus ?? (isStreaming ? 'running' : 'ready')}
          </span>
          {pendingApprovals.length > 0 && (
            <span className="rounded-full border border-[#f2d18b] bg-[#fff8e8] px-3 py-1 font-semibold text-[#b54708]">
              {pendingApprovals.length} approval{pendingApprovals.length === 1 ? '' : 's'} waiting
            </span>
          )}
          {activeHandoffStatus && (
            <span className="rounded-full border border-[#f3c8c5] bg-[#fff3f2] px-3 py-1 font-semibold text-[#d92d20]">
              human handoff {activeHandoffStatus}
            </span>
          )}
          {learnedSkill && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 py-1 font-semibold text-[#475467]">
              <BrainCircuit size={12} />
              <code className="font-mono text-[10px]">{learnedSkill.skillId}</code>
              {learnedIntentLabel && <span className="text-[#98a2b3]">{learnedIntentLabel}</span>}
            </span>
          )}
          {!beginnerMode && activeConversationId && (
            <span className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#98a2b3]">
              {shortId(activeConversationId)}
            </span>
          )}
        </div>

        {!beginnerMode && controlsExpanded && (
          <div className="mt-4 rounded-[22px] border border-[#eceef4] bg-[#fbfbfd] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">
                  Session details
                </p>
                <p className="mt-1 text-xs text-[#667085]">
                  Runtime defaults plus per-session thinking, verbose, and reasoning controls.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void executeOperatorCommand('/status')}
                  disabled={runtimeLoading || isStreaming}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#475467] transition hover:bg-[#f8fafc] disabled:opacity-50"
                >
                  <Gauge size={12} />
                  Status
                </button>
                <button
                  type="button"
                  onClick={() => void syncRuntimeState()}
                  disabled={runtimeLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#475467] transition hover:bg-[#f8fafc] disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tone-soft)]">
                  Default provider
                </span>
                <select
                  value={activeProvider}
                  disabled={runtimeLoading || Boolean(runtimeBusy)}
                  onChange={(e) => {
                    const provider = e.target.value
                    if (!isRuntimeProvider(provider)) return
                    void updateRuntimeSettings(provider, LLM_MODELS[provider].default, 'provider')
                  }}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--tone-strong)] outline-none transition focus:border-[var(--border-strong)] dark:text-[var(--tone-inverse)]"
                >
                  {RUNTIME_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {LLM_PROVIDER_CAPABILITIES[provider].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tone-soft)]">
                  Default model
                </span>
                <select
                  value={runtimeSettings?.preferredModel?.trim() || LLM_MODELS[activeProvider].default}
                  disabled={runtimeLoading || Boolean(runtimeBusy)}
                  onChange={(e) => void updateRuntimeSettings(activeProvider, e.target.value, 'model')}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--tone-strong)] outline-none transition focus:border-[var(--border-strong)] dark:text-[var(--tone-inverse)]"
                >
                  {providerModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tone-soft)]">
                  Thinking
                </span>
                <select
                  value={thinkingValue}
                  disabled={!activeConversationId || runtimeLoading || Boolean(runtimeBusy)}
                  onChange={(e) =>
                    void patchActiveSession(
                      { thinkingLevel: resolveThinkingPatchValue(e.target.value, binaryThinking) },
                      `Thinking level set to ${e.target.value || 'inherit'}.`,
                      'think',
                    )
                  }
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--tone-strong)] outline-none transition focus:border-[var(--border-strong)] disabled:opacity-60 dark:text-[var(--tone-inverse)]"
                >
                  {thinkingOptions.map((value) => (
                    <option key={value || 'inherit'} value={value}>
                      {value || 'inherit'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tone-soft)]">
                  Verbose
                </span>
                <select
                  value={verboseValue}
                  disabled={!activeConversationId || runtimeLoading || Boolean(runtimeBusy)}
                  onChange={(e) =>
                    void patchActiveSession(
                      { verboseLevel: e.target.value || null },
                      `Verbose level set to ${e.target.value || 'inherit'}.`,
                      'verbose',
                    )
                  }
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--tone-strong)] outline-none transition focus:border-[var(--border-strong)] disabled:opacity-60 dark:text-[var(--tone-inverse)]"
                >
                  {verboseOptions.map((option) => (
                    <option key={option.value || 'inherit'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tone-soft)]">
                  Reasoning
                </span>
                <select
                  value={reasoningValue}
                  disabled={!activeConversationId || runtimeLoading || Boolean(runtimeBusy)}
                  onChange={(e) =>
                    void patchActiveSession(
                      { reasoningLevel: e.target.value || null },
                      `Reasoning visibility set to ${e.target.value || 'inherit'}.`,
                      'reasoning',
                    )
                  }
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--tone-strong)] outline-none transition focus:border-[var(--border-strong)] disabled:opacity-60 dark:text-[var(--tone-inverse)]"
                >
                  {reasoningOptions.map((value) => (
                    <option key={value || 'inherit'} value={value}>
                      {value || 'inherit'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-muted)] px-3 py-3 sm:px-5">
        {visibleMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8">
            <div className="w-full max-w-[880px] rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                <div className="oa-brand-badge flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white">
                  OA
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                    OpenAgents chat
                  </p>
                  <p className="text-lg font-semibold">Give OpenAgents a clear outcome.</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                Keep the request concrete. OpenAgents is tuned for session work, approvals, tool use, and repeated operational tasks.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {assistantModeDefinition.starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={!gatewayConnected || isStreaming}
                    onClick={() => void handleQuickPrompt(prompt)}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-left text-[12px] font-medium text-[var(--tone-default)] transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--tone-inverse)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1">
                  <Command size={11} />
                  Type `/` for commands
                </span>
                <span>{gatewayConnected ? 'Runtime connected' : 'Runtime disconnected'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[1360px] space-y-3 pb-3 pt-1">
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <PinnedContext
        items={pinnedItems}
        onRemove={handleRemovePin}
        onAdd={handleAddPin}
      />

      <div className="border-t border-[#e4e7ec] bg-white px-4 py-3 dark:border-[#2d3347] dark:bg-[#141824]">
        {/* Slash command palette */}
        {slashQuery !== null && (
          <SlashCommandPalette
            query={slashQuery}
            onSelect={(cmd) => {
              setInput(cmd.template)
              setSlashQuery(null)
              focusComposer()
            }}
            onClose={() => setSlashQuery(null)}
          />
        )}

        {/* File attachment chips */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] px-2 py-1 text-[11px] text-[#344054] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#c9d1e0]"
              >
                {file.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.content} alt={file.name} className="h-5 w-5 rounded object-cover" />
                ) : (
                  <Paperclip size={11} className="shrink-0 text-[#98a2b3]" />
                )}
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  className="ml-0.5 text-[#98a2b3] hover:text-[#344054]"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input box */}
        <div className="rounded-2xl border border-[#e4e7ec] bg-white shadow-sm dark:border-[#2d3347] dark:bg-[#1a1f2e]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            disabled={isStreaming}
            rows={1}
            placeholder={
              gatewayConnected
                ? activeHandoffStatus
                  ? 'This session is in human handoff mode.'
                  : `${assistantModeDefinition.placeholder} (type / for commands)`
                : 'Runtime offline. /help still works locally.'
            }
            className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 text-sm text-[#101828] outline-none placeholder:text-[#98a2b3] disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="*/*"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#98a2b3] transition hover:bg-[#f2f4f7] hover:text-[#667085] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#1e2433]"
                aria-label="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#98a2b3] opacity-40"
                aria-label="Voice input"
              >
                <Mic size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {!beginnerMode && <ResponsePresets onApply={handlePresetApply} />}
              <button
                type="button"
                onClick={() => void handleEscalate()}
                disabled={!activeConversationId || Boolean(activeHandoffStatus) || isStreaming}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
              >
                <AlertTriangle size={11} />
                Need human
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={((!input.trim() && attachedFiles.length === 0) || isStreaming || (!gatewayConnected && !inputIsCommand && attachedFiles.length === 0)) || (Boolean(activeHandoffStatus) && !inputIsCommand)}
                className="oa-accent-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send message"
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Status line */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#98a2b3]">
          <span>{assistantModeDefinition.label} mode</span>
          <span className="inline-flex items-center gap-1">
            <Command size={10} />
            / commands
          </span>
          <span>{assistantStatusText}</span>
        </div>
      </div>
    </div>
  )
}
