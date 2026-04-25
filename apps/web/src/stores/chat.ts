import { create } from 'zustand'
import { sdk } from './auth'
import type { Conversation, Message, Approval, HumanHandoffTicket, MessageArtifact, MessageMeta, MessageProgressState, MessageWorkflowState, MessageWorkflowStep } from '@openagents/shared'

type GatewayStatus = 'connecting' | 'connected' | 'disconnected'

export interface ChatToolStreamEvent {
  id: string
  conversationId: string
  tool: string
  success: boolean
  output: unknown
  error?: string
  attempts?: number
  recoveredByRetry?: boolean
  createdAt: string
}

function clampPercent(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function deriveProgressPercent(status: string | null, data?: Record<string, unknown>) {
  const explicit = clampPercent(data?.percent)
  if (explicit !== null) return explicit
  const currentStep = Number(data?.currentStep)
  const totalSteps = Number(data?.totalSteps)
  if (Number.isFinite(currentStep) && Number.isFinite(totalSteps) && totalSteps > 0) {
    return clampPercent((currentStep / totalSteps) * 100)
  }
  switch (status) {
    case 'thinking':
      return 15
    case 'planning':
      return 28
    case 'executing':
      return 55
    case 'running_tool':
      return 68
    case 'retrying_tool':
      return 72
    case 'verifying':
      return 90
    case 'waiting_approval':
      return 95
    case 'done':
      return 100
    default:
      return null
  }
}

function formatProgressLabel(status: string | null, data?: Record<string, unknown>) {
  const toolName =
    typeof data?.tool === 'string' && data.tool.trim()
      ? data.tool.trim()
      : null

  switch (status) {
    case 'thinking':
      return 'Understanding the request'
    case 'planning':
      return 'Building a plan'
    case 'executing':
      return toolName ? `Executing with ${toolName}` : 'Executing steps'
    case 'running_tool':
      return toolName ? `Running ${toolName}` : 'Running tools'
    case 'retrying_tool':
      return toolName ? `Retrying ${toolName}` : 'Retrying step'
    case 'verifying':
      return 'Checking the result'
    case 'waiting_approval':
      return toolName ? `Waiting for approval: ${toolName}` : 'Waiting for approval'
    case 'done':
      return 'Completed'
    default:
      return null
  }
}

function toProgressState(status: string | null, data?: Record<string, unknown>): MessageProgressState | undefined {
  if (!status) return undefined
  const percent = deriveProgressPercent(status, data)
  const stage = typeof data?.stage === 'string' && data.stage.trim() ? data.stage.trim() : status
  const label =
    typeof data?.label === 'string' && data.label.trim()
      ? data.label.trim()
      : formatProgressLabel(status, data)
  const currentStep = Number.isFinite(Number(data?.currentStep)) ? Number(data?.currentStep) : undefined
  const totalSteps = Number.isFinite(Number(data?.totalSteps)) ? Number(data?.totalSteps) : undefined
  const etaSeconds = Number.isFinite(Number(data?.etaSeconds)) ? Number(data?.etaSeconds) : undefined
  return {
    stage,
    ...(label ? { label } : {}),
    ...(currentStep !== undefined ? { currentStep } : {}),
    ...(totalSteps !== undefined ? { totalSteps } : {}),
    ...(percent !== null ? { percent } : {}),
    ...(etaSeconds !== undefined ? { etaSeconds } : {}),
  }
}

function normalizeArtifacts(value: unknown): MessageArtifact[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const row = entry as Record<string, unknown>
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      const type = typeof row.type === 'string' ? row.type.trim() : ''
      if (!name || !['image', 'video', 'audio', 'file', 'link'].includes(type)) return null
      return {
        name,
        type: type as MessageArtifact['type'],
        ...(typeof row.url === 'string' && row.url.trim() ? { url: row.url.trim() } : {}),
        ...(typeof row.mimeType === 'string' && row.mimeType.trim() ? { mimeType: row.mimeType.trim() } : {}),
        ...(Number.isFinite(Number(row.sizeBytes)) ? { sizeBytes: Number(row.sizeBytes) } : {}),
        ...(typeof row.previewUrl === 'string' && row.previewUrl.trim() ? { previewUrl: row.previewUrl.trim() } : {}),
        ...(typeof row.summary === 'string' && row.summary.trim() ? { summary: row.summary.trim() } : {}),
      } satisfies MessageArtifact
    })
    .filter((item): item is MessageArtifact => Boolean(item))
}

function detectWorkflowKindFromArtifacts(artifacts: MessageArtifact[]): MessageWorkflowState['kind'] {
  if (artifacts.some((artifact) => artifact.type === 'video')) return 'video'
  if (artifacts.some((artifact) => artifact.type === 'image')) return 'image'
  if (artifacts.some((artifact) => artifact.type === 'audio')) return 'audio'
  if (artifacts.some((artifact) => artifact.type === 'file')) return 'artifact'
  return 'generic'
}

function buildDefaultWorkflowSteps(kind: MessageWorkflowState['kind'], status: string | null, data?: Record<string, unknown>): MessageWorkflowStep[] {
  const labels =
    kind === 'video'
      ? ['Prompt accepted', 'Storyboard', 'Render video', 'Review output']
      : kind === 'image'
        ? ['Prompt accepted', 'Compose image', 'Render image', 'Review output']
        : kind === 'audio'
          ? ['Prompt accepted', 'Generate audio', 'Finalize output']
          : ['Prompt accepted', 'Generate output', 'Review output']

  const activeIndex =
    status === 'thinking' ? 0
      : status === 'planning' ? 1
      : status === 'executing' || status === 'running_tool' || status === 'retrying_tool' ? Math.min(2, labels.length - 1)
      : status === 'verifying' ? labels.length - 1
      : status === 'done' ? labels.length
      : 0

  // 'generic' is valid for MessageWorkflowState but not for MessageWorkflowStep — map it to undefined
  const stepKind: MessageWorkflowStep['kind'] = (kind === 'generic' ? undefined : kind) as MessageWorkflowStep['kind']

  return labels.map((label, index) => ({
    id: `${kind}-step-${index + 1}`,
    label,
    status:
      status === 'error'
        ? index === Math.max(0, activeIndex - 1)
          ? 'failed'
          : index < Math.max(0, activeIndex - 1)
            ? 'completed'
            : 'pending'
        : activeIndex >= labels.length
          ? 'completed'
          : index < activeIndex
            ? 'completed'
            : index === activeIndex
              ? 'active'
              : 'pending',
    kind: stepKind,
    ...(typeof data?.tool === 'string' && index === activeIndex ? { detail: `tool: ${data.tool}` } : {}),
  }))
}

function toWorkflowState(status: string | null, data?: Record<string, unknown>, artifacts: MessageArtifact[] = []): MessageWorkflowState | undefined {
  const workflowKindRaw = typeof data?.workflowKind === 'string' ? data.workflowKind.trim().toLowerCase() : ''
  const title = typeof data?.workflowTitle === 'string' && data.workflowTitle.trim() ? data.workflowTitle.trim() : undefined
  const kind = (['image', 'video', 'audio', 'artifact', 'generic'].includes(workflowKindRaw)
    ? workflowKindRaw
    : detectWorkflowKindFromArtifacts(artifacts)) as MessageWorkflowState['kind']

  if (kind === 'generic' && artifacts.length === 0 && !title && !status) return undefined

  const steps = buildDefaultWorkflowSteps(kind, status, data)
  const currentStep = steps.find((step) => step.status === 'active')
  const normalizedStatus: MessageWorkflowState['status'] =
    status === 'done' ? 'completed'
      : status === 'error' ? 'failed'
      : 'active'

  return {
    kind,
    ...(title ? { title } : {}),
    status: normalizedStatus,
    ...(currentStep ? { currentStepId: currentStep.id } : {}),
    steps,
  }
}

function normalizeMessageMeta(metadata: Message['metadata'] | undefined): MessageMeta | undefined {
  if (!metadata) return undefined
  const parsed = typeof metadata === 'string'
    ? (() => {
        try {
          return JSON.parse(metadata) as MessageMeta
        } catch {
          return undefined
        }
      })()
    : metadata
  if (!parsed || typeof parsed !== 'object') return undefined
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function ensureArrayResponse<T>(value: unknown, label: string) {
  if (Array.isArray(value)) {
    return value as T[]
  }
  throw new Error(`Received an invalid ${label} response from the API.`)
}

function ensureConversationResponse(value: unknown) {
  if (isRecord(value) && typeof value.id === 'string') {
    return value as unknown as Conversation
  }
  throw new Error('Received an invalid conversation response from the API.')
}

function normalizeApproval(value: unknown): Approval | null {
  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.status === 'string'
  ) {
    return value as unknown as Approval
  }
  return null
}

function normalizeHandoff(value: unknown): HumanHandoffTicket | null {
  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.status === 'string'
  ) {
    return value as unknown as HumanHandoffTicket
  }
  return null
}

function formatAgentError(raw: string) {
  const value = raw.trim()
  if (!value) return 'Agent request failed.'

  const lower = value.toLowerCase()
  if (lower === 'network error' || lower.includes('network error')) {
    return 'Model provider network error. Verify your internet/proxy, then retry or switch provider in Settings > Config.'
  }
  if (lower.includes('invalid x-api-key') || lower.includes('authentication_error')) {
    return 'LLM authentication failed. Add a valid provider key in Settings > Config and retry.'
  }
  if (lower.includes('does not support tools')) {
    return 'Selected model does not support tools. Pick a tools-capable model in Settings > Config and retry.'
  }
  if (lower.includes('no local ollama models found') || lower.includes('no ollama models found')) {
    return 'No Ollama models were found at the configured server URL. Run `ollama pull <model>` and refresh models in Settings > Config.'
  }
  if (lower.includes('api key') && lower.includes('not configured')) {
    return value
  }
  return value
}

function extractErrorMessage(message: unknown, fallback: string) {
  if (typeof message !== 'string') return fallback
  const trimmed = message.trim()
  if (!trimmed) return fallback

  try {
    const parsed = JSON.parse(trimmed) as { message?: string | string[] }
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return String(parsed.message[0] ?? fallback)
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Not JSON; use the original message.
  }

  return trimmed
}

function deriveGatewayFailure(err: unknown, fallback: string): {
  gatewayStatus: GatewayStatus
  gatewayMessage: string
  lastError: string
} {
  const maybeError = err as { status?: unknown; message?: unknown } | null
  const status = typeof maybeError?.status === 'number' ? maybeError.status : null
  const message = extractErrorMessage(maybeError?.message, fallback)
  const offline =
    status === 0 ||
    /failed to reach api/i.test(message) ||
    /network request failed/i.test(message) ||
    /failed to fetch/i.test(message)

  return {
    gatewayStatus: offline ? 'disconnected' : 'connected',
    gatewayMessage: offline ? 'gateway offline (API unreachable)' : 'connected',
    lastError: message,
  }
}

function rememberActiveConversation(conversationId: string) {
  return sdk.users.updateSettings({ lastActiveConversationId: conversationId }).catch(() => {
    // Keep the selected conversation active locally even if settings sync fails.
  })
}

function formatStreamingStatus(status: string | null, data?: Record<string, unknown>) {
  if (!status) return ''

  const toolName =
    typeof data?.tool === 'string' && data.tool.trim()
      ? data.tool.trim()
      : 'tool'

  switch (status) {
    case 'thinking':
      return 'Thinking through your request...'
    case 'planning':
      return 'Planning execution strategy...'
    case 'executing': {
      const round = Number.isFinite(Number(data?.round)) ? Number(data?.round) : null
      return round ? `Executing tools (round ${round})...` : 'Executing tools...'
    }
    case 'running_tool':
      return `Running ${toolName}...`
    case 'retrying_tool': {
      const attempt = Number.isFinite(Number(data?.attempt)) ? Number(data?.attempt) : null
      return attempt ? `Retrying ${toolName} (attempt ${attempt})...` : `Retrying ${toolName}...`
    }
    case 'verifying':
      return 'Verifying results and finalizing...'
    case 'waiting_approval':
      return toolName !== 'tool' ? `⚠️ Approval needed: ${toolName}` : '⚠️ Approval needed'
    default:
      return ''
  }
}

function mergeMessageMeta(base: Message['metadata'] | undefined, patch: Partial<MessageMeta>): MessageMeta {
  const next: MessageMeta = {
    ...(normalizeMessageMeta(base) ?? {}),
    ...patch,
  }
  return next
}

function deriveConversationTitle(value: string) {
  const firstLine =
    value
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^[-*#>\s`]+/, '')
          .replace(/^\d+[.)]\s+/, '')
          .trim(),
      )
      .find(Boolean) ?? ''
  const normalized = firstLine.replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '').trim()
  if (!normalized) return null
  if (normalized.length <= 80) return normalized
  return `${normalized.slice(0, 77).trimEnd()}...`
}

function sortConversationsByRecentActivity(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    const leftTime = Date.parse(left.lastMessageAt ?? left.createdAt)
    const rightTime = Date.parse(right.lastMessageAt ?? right.createdAt)
    return rightTime - leftTime
  })
}

interface ChatState {
  conversations: Conversation[]
  conversationsLoading: boolean
  conversationsLoaded: boolean
  activeConversationId: string | null
  messages: Message[]
  pendingApprovals: Approval[]
  activeHandoff: HumanHandoffTicket | null
  streamToolEvents: ChatToolStreamEvent[]
  runStatus: string | null
  learnedSkill: {
    skillId: string
    intent?: string
    createdAt: string
  } | null
  isStreaming: boolean
  gatewayStatus: GatewayStatus
  gatewayMessage: string
  lastError: string | null
  thinkingSteps: Array<{ step: string; message: string; timestamp: number }>

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: () => Promise<string>
  sendMessage: (content: string, options?: { displayContent?: string; mode?: string }) => Promise<void>
  approveAction: (approvalId: string) => Promise<void>
  denyAction: (approvalId: string) => Promise<void>
  refreshActiveHandoff: () => Promise<void>
  escalateToHuman: (reason?: string) => Promise<void>
  clearError: () => void
  appendStreamChunk: (chunk: string) => void
  saveApiKey: (provider: string, apiKey: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  conversationsLoading: false,
  conversationsLoaded: false,
  activeConversationId: null,
  messages: [],
  pendingApprovals: [],
  activeHandoff: null,
  streamToolEvents: [],
  runStatus: null,
  learnedSkill: null,
  isStreaming: false,
  gatewayStatus: 'connecting',
  gatewayMessage: 'connecting...',
  lastError: null,
  thinkingSteps: [],

  async loadConversations() {
    set({ conversationsLoading: true })
    try {
      const conversations = ensureArrayResponse<Conversation>(
        await sdk.conversations.list(),
        'conversations',
      )
      set({
        conversations,
        conversationsLoading: false,
        conversationsLoaded: true,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      })
    } catch (err: unknown) {
      set({
        ...deriveGatewayFailure(err, 'Failed to load conversations.'),
        conversationsLoading: false,
        conversationsLoaded: true,
      })
    }
  },

  async selectConversation(id) {
    try {
      const [messagesResult, activeHandoffResult] = await Promise.all([
        sdk.conversations.messages(id),
        sdk.handoffs.getActive(id),
      ])
      const messages = ensureArrayResponse<Message>(messagesResult, 'messages')
      set({
        activeConversationId: id,
        messages,
        activeHandoff: normalizeHandoff(activeHandoffResult),
        streamToolEvents: [],
        runStatus: null,
        learnedSkill: null,
        isStreaming: false,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      })
      void rememberActiveConversation(id)
    } catch (err: unknown) {
      set(deriveGatewayFailure(err, 'Failed to load conversation.'))
    }
  },

  async createConversation() {
    try {
      const conv = ensureConversationResponse(await sdk.conversations.create())
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeConversationId: conv.id,
        messages: [],
        activeHandoff: null,
        streamToolEvents: [],
        runStatus: null,
        learnedSkill: null,
        isStreaming: false,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      }))
      void rememberActiveConversation(conv.id)
      return conv.id
    } catch (err: unknown) {
      set(deriveGatewayFailure(err, 'Failed to create conversation.'))
      throw err
    }
  },

  async sendMessage(content, options) {
    const { activeConversationId, activeHandoff } = get()
    if (!activeConversationId) {
      set({ lastError: 'No active conversation selected.' })
      return
    }

    const userVisibleContent = options?.displayContent?.trim() || content.trim()
    const startedAt = new Date().toISOString()
    const optimisticTitle = deriveConversationTitle(userVisibleContent)

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`
    set((s) => ({
      conversations: sortConversationsByRecentActivity(
        s.conversations.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                title: conversation.title?.trim() || optimisticTitle || conversation.title,
                lastMessageAt: startedAt,
              }
            : conversation,
        ),
      ),
      messages: [
        ...s.messages,
        {
          id: tempId,
          conversationId: activeConversationId,
          role: 'user',
          content: userVisibleContent,
          status: 'done',
          createdAt: startedAt,
        } as Message,
      ],
      streamToolEvents: [],
      runStatus: 'thinking',
      learnedSkill: null,
      isStreaming: true,
      gatewayStatus: 'connected',
      gatewayMessage: 'connected',
      lastError: null,
    }))

    // Add placeholder agent message for streaming
    const agentTempId = `agent-${Date.now()}`
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: agentTempId,
          conversationId: activeConversationId,
          role: 'agent',
          content: formatStreamingStatus('thinking'),
          status: 'streaming',
          createdAt: startedAt,
        } as Message,
      ],
    }))

    let streamError: string | null = null
    let sawAgentMessage = false
    let sawApprovalRequest = false

    try {
      await sdk.conversations.sendMessage(
        activeConversationId,
        content,
        (chunk) => {
          try {
          const data = JSON.parse(chunk)
          if (data.event === 'error') {
            const rawMessage =
              typeof data.data?.message === 'string'
                ? data.data.message
                : typeof data.data === 'string'
                  ? data.data
                  : 'Agent request failed.'
            const friendlyMessage = formatAgentError(rawMessage)
            streamError = friendlyMessage

            set((s) => ({
              lastError: friendlyMessage,
              runStatus: 'error',
              messages: s.messages.map((m) =>
                m.id === agentTempId ? { ...m, content: friendlyMessage, status: 'error' } : m,
              ),
            }))
            return
          }

          if (data.event === 'thinking') {
            const step = typeof data.data?.step === 'string' ? data.data.step : ''
            const message = typeof data.data?.message === 'string' ? data.data.message : ''
            if (step && message) {
              set((s) => ({
                thinkingSteps: [
                  ...s.thinkingSteps,
                  { step, message, timestamp: Date.now() },
                ],
              }))
            }
            // Also update the agent message content to show thinking progress
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === agentTempId && m.status === 'streaming'
                  ? { ...m, content: `🧠 ${message}` }
                  : m,
              ),
            }))
          }

          if (data.event === 'status') {
            const nextStatus = typeof data.data?.status === 'string' ? data.data.status : null
            const eventData = data.data && typeof data.data === 'object'
              ? (data.data as Record<string, unknown>)
              : undefined
            const learnedSkillId = typeof data.data?.learnedSkill === 'string'
              ? data.data.learnedSkill.trim()
              : ''
            const learnedIntent = typeof data.data?.learnedIntent === 'string'
              ? data.data.learnedIntent.trim()
              : ''
            if (nextStatus) {
              const statusText = formatStreamingStatus(nextStatus, eventData)
              const progress = toProgressState(nextStatus, eventData)
              const artifacts = normalizeArtifacts(eventData?.artifacts)
              const workflow = toWorkflowState(nextStatus, eventData, artifacts)
              set((s) => ({
                runStatus: nextStatus,
                messages: s.messages.map((m) =>
                  m.id === agentTempId && !sawAgentMessage && m.status === 'streaming'
                    ? {
                        ...m,
                        content: statusText || m.content,
                        metadata: mergeMessageMeta(m.metadata, {
                          ...(progress ? { progress } : {}),
                          ...(workflow ? { workflow } : {}),
                          ...(artifacts.length > 0 ? { artifacts } : {}),
                          ...(statusText ? { statusLabel: statusText } : {}),
                        }),
                      }
                    : m,
                ),
              }))
            }
            if (learnedSkillId) {
              set({
                learnedSkill: {
                  skillId: learnedSkillId,
                  ...(learnedIntent ? { intent: learnedIntent } : {}),
                  createdAt: new Date().toISOString(),
                },
              })
            }
          }

          if (data.event === 'message' && data.data?.role === 'agent') {
            sawAgentMessage = true
            const artifacts = normalizeArtifacts(data.data?.metadata && typeof data.data.metadata === 'object'
              ? (data.data.metadata as Record<string, unknown>).artifacts
              : undefined)
            const workflow = toWorkflowState('done', data.data?.metadata && typeof data.data.metadata === 'object'
              ? (data.data.metadata as Record<string, unknown>)
              : undefined, artifacts)
            set((s) => ({
              isStreaming: false,
              runStatus: 'done',
              lastError: null,
              messages: s.messages.map((m) =>
                m.id === agentTempId
                  ? {
                      ...m,
                      content: data.data.content,
                      status: 'done',
                      metadata: mergeMessageMeta(m.metadata, {
                        progress: { stage: 'done', label: 'Completed', percent: 100 },
                        ...(workflow ? { workflow } : {}),
                        ...(artifacts.length > 0 ? { artifacts } : {}),
                      }),
                    }
                  : m,
              ),
            }))
          }

          if (data.event === 'tokens') {
            const tokens = data.data as { inputTokens?: number; outputTokens?: number; totalTokens?: number; model?: string; durationMs?: number } | undefined
            if (tokens) {
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === agentTempId
                    ? { ...m, metadata: mergeMessageMeta(m.metadata, { tokens }) }
                    : m,
                ),
              }))
            }
          }

          if (data.event === 'tool_result') {
            const toolName = typeof data.data?.tool === 'string' ? data.data.tool : 'tool'
            const result = data.data?.result as { success?: unknown; output?: unknown; error?: unknown } | undefined
            const success = Boolean(result?.success)
            const output = result?.output ?? null
            const error = typeof result?.error === 'string' ? result.error : undefined
            const attempts = Number.isFinite(Number(data.data?.attempts)) ? Number(data.data?.attempts) : undefined
            const recoveredByRetry = typeof data.data?.recoveredByRetry === 'boolean'
              ? data.data.recoveredByRetry
              : undefined
            const event: ChatToolStreamEvent = {
              id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              conversationId: activeConversationId,
              tool: toolName,
              success,
              output,
              ...(error ? { error } : {}),
              ...(attempts ? { attempts } : {}),
              ...(typeof recoveredByRetry === 'boolean' ? { recoveredByRetry } : {}),
              createdAt: new Date().toISOString(),
            }
            set((s) => ({
              streamToolEvents: [...s.streamToolEvents.slice(-79), event],
            }))
          }

          if (data.event === 'approval_required') {
            sawApprovalRequest = true
            const approval = normalizeApproval(data.data?.approval)
            const approvalMessage =
              typeof data.data?.message?.content === 'string' && data.data.message.content.trim()
                ? data.data.message.content.trim()
                : approval?.toolName
                  ? `Approval requested for ${approval.toolName}. Review the pending action to continue.`
                  : 'Approval requested. Review the pending action to continue.'

            set((s) => ({
              runStatus: 'waiting_approval',
              pendingApprovals: approval
                ? s.pendingApprovals.some((item) => item.id === approval.id)
                  ? s.pendingApprovals
                  : [...s.pendingApprovals, approval]
                : s.pendingApprovals,
              messages: s.messages.map((m) =>
                m.id === agentTempId
                  ? { ...m, content: approvalMessage, status: 'done' }
                  : m,
              ),
            }))
          }
        } catch {}
      },
      options?.mode ? { mode: options.mode } : undefined)

      // Reload messages to get server-side IDs
      const messages = ensureArrayResponse<Message>(
        await sdk.conversations.messages(activeConversationId),
        'messages',
      )
      const activeHandoff = normalizeHandoff(await sdk.handoffs.getActive(activeConversationId))

      let nextMessages = messages
      if (streamError) {
        const latestUser = [...messages].reverse().find((m) => m.role === 'user')
        const latestAgentAfterUser = [...messages]
          .reverse()
          .find((m) => m.role === 'agent' && (!latestUser || m.createdAt >= latestUser.createdAt))

        if (!latestAgentAfterUser) {
          nextMessages = [
            ...messages,
            {
              id: `agent-error-${Date.now()}`,
              conversationId: activeConversationId,
              role: 'agent',
              content: streamError,
              status: 'error',
              createdAt: new Date().toISOString(),
            } as Message,
          ]
        }
      } else if (!sawAgentMessage && !sawApprovalRequest) {
        streamError = 'Agent returned no reply. Check provider settings and try again.'
        const latestUser = [...messages].reverse().find((m) => m.role === 'user')
        const latestAgentAfterUser = [...messages]
          .reverse()
          .find((m) => m.role === 'agent' && (!latestUser || m.createdAt >= latestUser.createdAt))

        if (!latestAgentAfterUser) {
          nextMessages = [
            ...messages,
            {
              id: `agent-empty-${Date.now()}`,
              conversationId: activeConversationId,
              role: 'agent',
              content: streamError,
              status: 'error',
              createdAt: new Date().toISOString(),
            } as Message,
          ]
        }
      }

      set({
        messages: nextMessages,
        activeHandoff,
        isStreaming: false,
        runStatus: streamError ? 'error' : sawApprovalRequest ? 'waiting_approval' : 'done',
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: streamError,
      })
    } catch (err: unknown) {
      const failure = deriveGatewayFailure(err, 'Failed while streaming agent response.')
      set((s) => ({
        isStreaming: false,
        runStatus: 'error',
        gatewayStatus: failure.gatewayStatus,
        gatewayMessage: failure.gatewayMessage,
        lastError: failure.lastError,
        messages: s.messages.map((m) =>
          m.id === agentTempId
            ? { ...m, content: failure.lastError, status: 'error' }
            : m,
        ),
      }))
    }
  },

  appendStreamChunk(chunk) {
    set((s) => {
      const last = s.messages[s.messages.length - 1]
      if (!last || last.role !== 'agent') return s
      return {
        messages: s.messages.map((m, i) =>
          i === s.messages.length - 1 ? { ...m, content: m.content + chunk } : m,
        ),
      }
    })
  },

  async approveAction(approvalId) {
    try {
      await sdk.approvals.approve(approvalId)
      set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId), lastError: null }))
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to approve action' })
    }
  },

  async denyAction(approvalId) {
    try {
      await sdk.approvals.deny(approvalId)
      set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId), lastError: null }))
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to deny action' })
    }
  },

  async refreshActiveHandoff() {
    const { activeConversationId } = get()
    if (!activeConversationId) return
    try {
      const handoff = normalizeHandoff(await sdk.handoffs.getActive(activeConversationId))
      set({ activeHandoff: handoff, lastError: null })
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to refresh handoff state' })
    }
  },

  async escalateToHuman(reason?: string) {
    const { activeConversationId } = get()
    if (!activeConversationId) {
      set({ lastError: 'No active conversation selected.' })
      return
    }
    try {
      const handoff = normalizeHandoff(await sdk.handoffs.create({
        conversationId: activeConversationId,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      }))
      set({ activeHandoff: handoff, lastError: null })
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to escalate conversation' })
    }
  },

  clearError() {
    set({ lastError: null })
  },

  async saveApiKey(provider: string, apiKey: string) {
    try {
      await sdk.users.upsertLlmKey(provider, { apiKey })
      set({ lastError: null })
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to save API key' })
    }
  },
}))
