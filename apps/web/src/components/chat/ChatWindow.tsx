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
import { WebRtcVoiceControls } from './WebRtcVoiceControls'
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
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
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
  return {
    provider: settings?.preferredProvider?.trim() || 'ollama',
    model: settings?.preferredModel?.trim() || 'hf.co/unsloth/gemma-4-12b-it-GGUF',
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
  onOpenMobileSessions,
}: ChatWindowProps) {
  const {
    messages,
    sendMessage,
    isStreaming,
    activeConversationId,
    learnedSkill,
    runStatus,
    pendingApprovals,
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false)
  const mcpPickerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const activeProvider = useMemo(() => {
    const normalized = normalizeProviderId(runtimeSettings?.preferredProvider)
    return isRuntimeProvider(normalized) ? normalized : 'ollama'
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

  useEffect(() => {
    if (!modelPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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

    await sendMessage(content, { displayContent: displayWithFiles || displayContent, mode: assistantMode })
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[#e6e8ef] bg-[#f7f8fb] shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between border-b border-[#e8ebf2] bg-[#fbfbfd] px-4 py-3 dark:border-[#2d3347] dark:bg-[#141824] sm:px-6">
        {/* Left: clean model select dropdown */}
        <div ref={modelPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setModelPickerOpen((o) => !o)}
            disabled={Boolean(runtimeBusy) || runtimeLoading}
            className={clsx(
              'inline-flex items-center gap-1.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition dark:text-[#a1a1aa] dark:hover:text-white',
              (Boolean(runtimeBusy) || runtimeLoading) && 'opacity-50 cursor-not-allowed',
            )}
            title="Switch model"
          >
            <span>{runtimeSettings?.preferredModel ? (runtimeSettings.preferredModel.split('/').pop() || runtimeSettings.preferredModel) : 'Select model'}</span>
            <ChevronDown size={14} className={clsx('transition-transform', modelPickerOpen ? 'rotate-180' : '')} />
          </button>

          {modelPickerOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[18px] border border-[#e4e7ec] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)] dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="border-b border-[#f2f4f7] px-4 py-3 dark:border-[#2d3347]">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">Model</p>
              </div>

              {/* Provider tabs */}
              <div className="flex gap-1 overflow-x-auto px-3 pt-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {RUNTIME_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void updateRuntimeSettings(p, LLM_MODELS[p].default, 'provider')}
                    className={clsx(
                      'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                      activeProvider === p
                        ? 'bg-[#f4fbf7] text-[#10b981] border border-[#a7f3d0] dark:bg-[#064e3b] dark:text-[#34d399] dark:border-[#065f46]'
                        : 'text-[#667085] hover:bg-[#f8fafc] border border-transparent dark:text-[#a1a1aa] dark:hover:bg-[#232837]',
                    )}
                  >
                    {LLM_PROVIDER_CAPABILITIES[p].label}
                  </button>
                ))}
              </div>

              {/* Model list */}
              <div className="max-h-52 overflow-y-auto px-2 pb-3 pt-1">
                {providerModelOptions.map((model) => {
                  const active = (runtimeSettings?.preferredModel?.trim() || LLM_MODELS[activeProvider].default) === model
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => { void updateRuntimeSettings(activeProvider, model, 'model'); setModelPickerOpen(false) }}
                      className={clsx(
                        'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px] transition',
                        active
                          ? 'bg-[#f4fbf7] font-semibold text-[#10b981] dark:bg-[#064e3b] dark:text-[#34d399]'
                          : 'text-[#344054] hover:bg-[#f8fafc] dark:text-[#c9d1e0] dark:hover:bg-[#232837]',
                      )}
                    >
                      <span className="truncate">{model}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#10b981]" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: mobile menu toggle */}
        {onOpenMobileSessions && (
          <button
            type="button"
            onClick={onOpenMobileSessions}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e4e7ec] bg-white text-[#667085] transition hover:bg-[#f8fafc] xl:hidden dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
            title="Menu"
          >
            <Menu size={16} />
          </button>
        )}
      </div>

      {visibleMessages.length === 0 ? (
        /* ── Landing / empty state ── */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#f7f8fb] px-4 py-10 dark:bg-[#0f1117]">
          <div className="flex flex-col items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-3">
              <div className="oa-brand-badge flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white shrink-0">
                OA
              </div>
              <h1 className="text-3xl font-semibold text-[#101828] dark:text-white tracking-tight">
                How can I help?
              </h1>
            </div>
          </div>

          {/* Input card */}
          <div className="relative w-full max-w-2xl">
            {slashQuery !== null && (
              <SlashCommandPalette
                query={slashQuery}
                onSelect={(cmd) => { setInput(cmd.template); setSlashQuery(null); focusComposer() }}
                onClose={() => setSlashQuery(null)}
              />
            )}

            <div className="rounded-[28px] border border-[#e4e7ec] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.06)] dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              {/* File chips */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pt-4">
                  {attachedFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] px-2 py-1 text-[11px] text-[#344054] dark:border-[#2d3347] dark:bg-[#141824]">
                      {file.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.content} alt={file.name} className="h-5 w-5 rounded object-cover" />
                      ) : (
                        <Paperclip size={11} className="shrink-0 text-[#98a2b3]" />
                      )}
                      <span className="max-w-[140px] truncate">{file.name}</span>
                      <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))} className="ml-0.5 text-[#98a2b3] hover:text-[#344054]" aria-label={`Remove ${file.name}`}>×</button>
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
                placeholder="Ask anything"
                className="max-h-48 min-h-[96px] w-full resize-none bg-transparent px-5 pt-5 text-[15px] text-[#101828] outline-none placeholder:text-[#b0b8cc] disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
              />

              <div className="flex items-center justify-between border-t border-[#f2f4f7] px-4 py-3 dark:border-[#2d3347]">
                {/* Left: attach + badge pills */}
                <div className="flex items-center gap-1.5">
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
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => prev.startsWith('/search ') ? prev : `/search ${prev}`)
                      focusComposer()
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                  >
                    <Search size={11} className="text-[#10b981]" />
                    <span>Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAssistantModeChange('execute')
                      setInput((prev) => prev + (prev ? '\n' : '') + '```\n\n```')
                      focusComposer()
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                  >
                    <Code size={11} className="text-[#10b981]" />
                    <span>Code</span>
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
                      <div className="absolute left-0 bottom-full z-50 mb-2 w-56 overflow-hidden rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-lg dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                        <p className="text-[11px] font-semibold text-[#10b981] mb-2">Model Context Protocol</p>
                        <p className="text-[11px] text-[#667085] mb-2 dark:text-[#a1a1aa]">Active local servers:</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>filesystem</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>web-search</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>developer-tools</span>
                          </div>
                        </div>
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
                    disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming || (!gatewayConnected && !inputIsCommand && attachedFiles.length === 0)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10b981] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Send message"
                  >
                    <ArrowUp size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Active chat — messages + bottom input bar ── */
        <>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7fb] px-4 py-4 sm:px-7 dark:bg-[#0f1117]">
            <div className="mx-auto w-full max-w-[980px] space-y-6 pb-6 pt-2">
              {visibleMessages.map((message, idx) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  conversationId={activeConversationId ?? undefined}
                  messageIndex={idx + 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <PinnedContext items={pinnedItems} onRemove={handleRemovePin} onAdd={handleAddPin} />

          <div className="border-t border-[#e4e7ec] bg-[#fbfbfd] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] dark:border-[#2d3347] dark:bg-[#141824] sm:px-6">
            {slashQuery !== null && (
              <SlashCommandPalette
                query={slashQuery}
                onSelect={(cmd) => { setInput(cmd.template); setSlashQuery(null); focusComposer() }}
                onClose={() => setSlashQuery(null)}
              />
            )}

            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] px-2 py-1 text-[11px] text-[#344054] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#c9d1e0]">
                    {file.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.content} alt={file.name} className="h-5 w-5 rounded object-cover" />
                    ) : (
                      <Paperclip size={11} className="shrink-0 text-[#98a2b3]" />
                    )}
                    <span className="max-w-[140px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))} className="ml-0.5 text-[#98a2b3] hover:text-[#344054]" aria-label={`Remove ${file.name}`}>x</button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-[22px] border border-[#e4e7ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                disabled={isStreaming}
                rows={1}
                placeholder="Ask anything"
                className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-4 pt-4 text-base text-[#101828] outline-none placeholder:text-[#a1a1aa] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm dark:text-white"
              />
              <div className="flex items-center justify-between border-t border-[#f2f4f7] px-3 py-2.5 dark:border-[#2d3347]">
                {/* Left: attach + badge pills */}
                <div className="flex items-center gap-1.5">
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
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => prev.startsWith('/search ') ? prev : `/search ${prev}`)
                      focusComposer()
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                  >
                    <Search size={11} className="text-[#10b981]" />
                    <span>Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAssistantModeChange('execute')
                      setInput((prev) => prev + (prev ? '\n' : '') + '```\n\n```')
                      focusComposer()
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]"
                  >
                    <Code size={11} className="text-[#10b981]" />
                    <span>Code</span>
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
                      <div className="absolute left-0 bottom-full z-50 mb-2 w-56 overflow-hidden rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-lg dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                        <p className="text-[11px] font-semibold text-[#10b981] mb-2">Model Context Protocol</p>
                        <p className="text-[11px] text-[#667085] mb-2 dark:text-[#a1a1aa]">Active local servers:</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>filesystem</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>web-search</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#344054] dark:text-[#c9d1e0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                            <span>developer-tools</span>
                          </div>
                        </div>
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
                    disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming || (!gatewayConnected && !inputIsCommand && attachedFiles.length === 0)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10b981] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Send message"
                  >
                    <ArrowUp size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#98a2b3]">
              <span>{assistantModeDefinition.label} mode</span>
              <span className="inline-flex items-center gap-1"><Command size={10} />/ commands</span>
              <span>{assistantStatusText}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
