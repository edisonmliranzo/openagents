'use client'

import { sdk } from '@/stores/auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AllowWhatsAppDeviceInput,
  DiscordChannelHealth,
  DiscordPairingSession,
  DiscordServerLink,
  Notification,
  SlackChannelHealth,
  SlackPairingSession,
  SlackWorkspaceLink,
  TelegramChannelHealth,
  TelegramChatLink,
  TelegramPairingSession,
  WhatsAppChannelHealth,
  WhatsAppDeviceLink,
  WhatsAppPairingSession,
} from '@openagents/shared'

interface ConnectorTool {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  source?: 'builtin' | 'mcp'
  serverId?: string
  originalName?: string
}

interface ChannelGroup {
  id: string
  label: string
  description: string
}

const CHANNEL_GROUPS: ChannelGroup[] = [
  { id: 'gmail', label: 'Gmail', description: 'Inbox search and draft tools' },
  { id: 'calendar', label: 'Calendar', description: 'Availability and event creation' },
  { id: 'web', label: 'Web', description: 'Web content retrieval' },
  { id: 'notes', label: 'Notes', description: 'Internal notes and memory capture' },
  { id: 'mcp', label: 'MCP', description: 'Model Context Protocol servers' },
  { id: 'other', label: 'Other', description: 'Additional connector capabilities' },
]

function inferGroupId(tool: ConnectorTool) {
  if (tool.source === 'mcp') return 'mcp'
  const toolName = tool.name
  if (toolName.startsWith('gmail_')) return 'gmail'
  if (toolName.startsWith('calendar_')) return 'calendar'
  if (toolName.startsWith('web_')) return 'web'
  if (toolName.startsWith('notes_')) return 'notes'
  return 'other'
}

function timeAgo(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

function timeUntil(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.floor((ts - Date.now()) / 60000)
  if (deltaMin <= 0) return 'expired'
  if (deltaMin < 60) return `${deltaMin}m`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h`
  return `${Math.floor(deltaHours / 24)}d`
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  if (typeof document === 'undefined') return
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export default function ChannelsPage() {
  const [tools, setTools] = useState<ConnectorTool[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null)

  // WhatsApp
  const [whatsAppHealth, setWhatsAppHealth] = useState<WhatsAppChannelHealth | null>(null)
  const [whatsAppDevices, setWhatsAppDevices] = useState<WhatsAppDeviceLink[]>([])
  const [whatsAppPairings, setWhatsAppPairings] = useState<WhatsAppPairingSession[]>([])
  const [isCreatingPairing, setIsCreatingPairing] = useState(false)
  const [isAllowlistingDevice, setIsAllowlistingDevice] = useState(false)
  const [unlinkingDeviceId, setUnlinkingDeviceId] = useState<string | null>(null)
  const [pairingExpiryMinutes, setPairingExpiryMinutes] = useState(15)
  const [allowlistPhone, setAllowlistPhone] = useState('')
  const [allowlistLabel, setAllowlistLabel] = useState('')
  const [copiedPairingId, setCopiedPairingId] = useState<string | null>(null)

  // Telegram
  const [telegramHealth, setTelegramHealth] = useState<TelegramChannelHealth | null>(null)
  const [telegramChats, setTelegramChats] = useState<TelegramChatLink[]>([])
  const [telegramPairings, setTelegramPairings] = useState<TelegramPairingSession[]>([])
  const [isCreatingTelegramPairing, setIsCreatingTelegramPairing] = useState(false)
  const [telegramWebhookUrl, setTelegramWebhookUrl] = useState('')
  const [isRegisteringTelegramWebhook, setIsRegisteringTelegramWebhook] = useState(false)
  const [unlinkingTelegramChatId, setUnlinkingTelegramChatId] = useState<string | null>(null)

  // Slack
  const [slackHealth, setSlackHealth] = useState<SlackChannelHealth | null>(null)
  const [slackWorkspaces, setSlackWorkspaces] = useState<SlackWorkspaceLink[]>([])
  const [slackPairings, setSlackPairings] = useState<SlackPairingSession[]>([])
  const [isCreatingSlackPairing, setIsCreatingSlackPairing] = useState(false)
  const [unlinkingSlackWorkspaceId, setUnlinkingSlackWorkspaceId] = useState<string | null>(null)

  // Discord
  const [discordHealth, setDiscordHealth] = useState<DiscordChannelHealth | null>(null)
  const [discordServers, setDiscordServers] = useState<DiscordServerLink[]>([])
  const [discordPairings, setDiscordPairings] = useState<DiscordPairingSession[]>([])
  const [isCreatingDiscordPairing, setIsCreatingDiscordPairing] = useState(false)
  const [unlinkingDiscordServerId, setUnlinkingDiscordServerId] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [
        toolList, approvals, notifications,
        health, devices, pairings,
        tgHealth, tgChats, tgPairings,
        slHealth, slWorkspaces, slPairings,
        dcHealth, dcServers, dcPairings,
      ] = await Promise.all([
        sdk.tools.list(),
        sdk.approvals.list('pending'),
        sdk.notifications.list(),
        sdk.channels.whatsappHealth(),
        sdk.channels.listWhatsAppDevices(),
        sdk.channels.listWhatsAppPairings(),
        sdk.channels.telegramHealth(),
        sdk.channels.listTelegramChats(),
        sdk.channels.listTelegramPairings(),
        sdk.channels.slackHealth(),
        sdk.channels.listSlackWorkspaces(),
        sdk.channels.listSlackPairings(),
        sdk.channels.discordHealth(),
        sdk.channels.listDiscordServers(),
        sdk.channels.listDiscordPairings(),
      ])
      setTools(toolList)
      setPendingApprovals(approvals.length)
      setLatestNotification(notifications[0] ?? null)
      setWhatsAppHealth(health)
      setWhatsAppDevices(devices)
      setWhatsAppPairings(pairings)
      setTelegramHealth(tgHealth)
      setTelegramChats(tgChats)
      setTelegramPairings(tgPairings)
      setSlackHealth(slHealth)
      setSlackWorkspaces(slWorkspaces)
      setSlackPairings(slPairings)
      setDiscordHealth(dcHealth)
      setDiscordServers(dcServers)
      setDiscordPairings(dcPairings)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load channels')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const toolsByGroup = useMemo(() => {
    const grouped = new Map<string, ConnectorTool[]>()
    for (const group of CHANNEL_GROUPS) {
      grouped.set(group.id, [])
    }

    for (const tool of tools) {
      const groupId = inferGroupId(tool)
      const list = grouped.get(groupId) ?? []
      list.push(tool)
      grouped.set(groupId, list)
    }

    return grouped
  }, [tools])

  const activePairing = useMemo(
    () => whatsAppPairings.find((pairing) => pairing.status === 'pending') ?? whatsAppPairings[0] ?? null,
    [whatsAppPairings],
  )

  const whatsAppStatus = whatsAppHealth?.twilioConfigured
    ? 'enabled'
      : whatsAppHealth
        ? 'planned'
        : 'planned'

  const handleAllowlistDevice = useCallback(async () => {
    const input: AllowWhatsAppDeviceInput = {
      phone: allowlistPhone.trim(),
      ...(allowlistLabel.trim() ? { label: allowlistLabel.trim() } : {}),
    }
    if (!input.phone) {
      setError('Phone or WhatsApp address is required for the allowlist.')
      return
    }

    setIsAllowlistingDevice(true)
    setError('')
    try {
      await sdk.channels.allowWhatsAppDevice(input)
      setAllowlistPhone('')
      setAllowlistLabel('')
      await loadData()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to allowlist WhatsApp sender')
    } finally {
      setIsAllowlistingDevice(false)
    }
  }, [allowlistLabel, allowlistPhone, loadData])

  const handleCreatePairing = useCallback(async () => {
    setIsCreatingPairing(true)
    setError('')
    try {
      const nextPairing = await sdk.channels.createWhatsAppPairing({
        expiresInMinutes: pairingExpiryMinutes,
      })
      setWhatsAppPairings((current) => [nextPairing, ...current.filter((item) => item.id !== nextPairing.id)])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create WhatsApp pairing')
    } finally {
      setIsCreatingPairing(false)
    }
  }, [pairingExpiryMinutes])

  const handleCopyPairingLink = useCallback(async (pairing: WhatsAppPairingSession) => {
    if (!pairing.linkUrl) return
    try {
      await copyToClipboard(pairing.linkUrl)
      setCopiedPairingId(pairing.id)
      window.setTimeout(() => setCopiedPairingId((current) => (current === pairing.id ? null : current)), 1200)
    } catch {
      setCopiedPairingId(null)
    }
  }, [])

  const handleUnlinkDevice = useCallback(async (deviceId: string) => {
    setUnlinkingDeviceId(deviceId)
    setError('')
    try {
      await sdk.channels.unlinkWhatsAppDevice(deviceId)
      setWhatsAppDevices((current) => current.filter((device) => device.id !== deviceId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlink WhatsApp device')
    } finally {
      setUnlinkingDeviceId(null)
    }
  }, [])

  // ─── Telegram handlers ────────────────────────────────────────────────────

  const handleCreateTelegramPairing = useCallback(async () => {
    setIsCreatingTelegramPairing(true)
    setError('')
    try {
      const pairing = await sdk.channels.createTelegramPairing({})
      setTelegramPairings((current) => [pairing, ...current.filter((p) => p.id !== pairing.id)])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create Telegram pairing')
    } finally {
      setIsCreatingTelegramPairing(false)
    }
  }, [])

  const handleRegisterTelegramWebhook = useCallback(async () => {
    if (!telegramWebhookUrl.trim()) {
      setError('Webhook URL is required.')
      return
    }
    setIsRegisteringTelegramWebhook(true)
    setError('')
    try {
      const result = await sdk.channels.registerTelegramWebhook({ webhookUrl: telegramWebhookUrl.trim() })
      if (!result.ok) setError(result.description ?? 'Telegram webhook registration failed.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to register Telegram webhook')
    } finally {
      setIsRegisteringTelegramWebhook(false)
    }
  }, [telegramWebhookUrl])

  const handleUnlinkTelegramChat = useCallback(async (chatId: string) => {
    setUnlinkingTelegramChatId(chatId)
    setError('')
    try {
      await sdk.channels.unlinkTelegramChat(chatId)
      setTelegramChats((current) => current.filter((c) => c.id !== chatId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlink Telegram chat')
    } finally {
      setUnlinkingTelegramChatId(null)
    }
  }, [])

  // ─── Slack handlers ───────────────────────────────────────────────────────

  const handleCreateSlackPairing = useCallback(async () => {
    setIsCreatingSlackPairing(true)
    setError('')
    try {
      const pairing = await sdk.channels.createSlackPairing({})
      setSlackPairings((current) => [pairing, ...current.filter((p) => p.id !== pairing.id)])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create Slack pairing')
    } finally {
      setIsCreatingSlackPairing(false)
    }
  }, [])

  const handleUnlinkSlackWorkspace = useCallback(async (workspaceId: string) => {
    setUnlinkingSlackWorkspaceId(workspaceId)
    setError('')
    try {
      await sdk.channels.unlinkSlackWorkspace(workspaceId)
      setSlackWorkspaces((current) => current.filter((w) => w.id !== workspaceId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlink Slack workspace')
    } finally {
      setUnlinkingSlackWorkspaceId(null)
    }
  }, [])

  // ─── Discord handlers ─────────────────────────────────────────────────────

  const handleCreateDiscordPairing = useCallback(async () => {
    setIsCreatingDiscordPairing(true)
    setError('')
    try {
      const pairing = await sdk.channels.createDiscordPairing({})
      setDiscordPairings((current) => [pairing, ...current.filter((p) => p.id !== pairing.id)])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create Discord pairing')
    } finally {
      setIsCreatingDiscordPairing(false)
    }
  }, [])

  const handleUnlinkDiscordServer = useCallback(async (serverId: string) => {
    setUnlinkingDiscordServerId(serverId)
    setError('')
    try {
      await sdk.channels.unlinkDiscordServer(serverId)
      setDiscordServers((current) => current.filter((s) => s.id !== serverId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlink Discord server')
    } finally {
      setUnlinkingDiscordServerId(null)
    }
  }, [])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Channels</h1>
          <p className="mt-1 text-sm text-slate-500">Connector and channel capability status.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registered Tools</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{tools.length}</p>
          <p className="mt-1 text-xs text-slate-500">Total callable connector actions</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Approvals</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{pendingApprovals}</p>
          <p className="mt-1 text-xs text-slate-500">Actions waiting on user confirmation</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest Notification</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">
            {latestNotification?.title ?? 'No alerts'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {latestNotification ? `${latestNotification.type} - ${timeAgo(latestNotification.createdAt)}` : 'n/a'}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">WhatsApp Pairing</h2>
              <p className="text-sm text-slate-500">
                Generate a one-time code, then scan/open link on a phone to pair that device. Unknown senders are blocked by default unless explicitly allowlisted.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                whatsAppStatus === 'enabled'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {whatsAppStatus}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Expires in (minutes)
              <input
                type="number"
                min={3}
                max={240}
                value={pairingExpiryMinutes}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  setPairingExpiryMinutes(Number.isFinite(value) ? Math.max(3, Math.min(value, 240)) : 15)
                }}
                className="ml-2 h-9 w-24 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleCreatePairing()}
              disabled={isCreatingPairing || !whatsAppHealth?.twilioConfigured}
              className="h-9 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingPairing ? 'Generating...' : 'Generate Pair QR/Link'}
            </button>
          </div>

          {!whatsAppHealth?.twilioConfigured && (
            <p className="mt-2 text-xs text-amber-700">
              Twilio WhatsApp env config is missing. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_FROM`.
            </p>
          )}

          {whatsAppHealth?.legacyDefaultRouteEnabled && (
            <p className="mt-2 text-xs text-amber-700">
              Legacy default routing is enabled. Unknown senders can still route through `WHATSAPP_DEFAULT_USER_ID`.
            </p>
          )}

          {!whatsAppHealth?.legacyDefaultRouteEnabled && whatsAppHealth && (
            <p className="mt-2 text-xs text-emerald-700">
              Allowlist policy is enforced. Only paired or manually allowlisted senders can open a conversation.
            </p>
          )}

          {activePairing && (
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[120px_1fr]">
              <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                {activePairing.qrImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activePairing.qrImageUrl} alt="WhatsApp pairing QR" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">No QR</span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Code: <span className="font-mono">{activePairing.code}</span>
                </p>
                <p className="font-mono text-xs text-slate-500">{activePairing.command}</p>
                <p className="text-xs text-slate-500">
                  Status: <strong>{activePairing.status}</strong> | Expires in {timeUntil(activePairing.expiresAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!activePairing.linkUrl) return
                      window.open(activePairing.linkUrl, '_blank', 'noopener,noreferrer')
                    }}
                    disabled={!activePairing.linkUrl}
                    className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Open WhatsApp Link
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyPairingLink(activePairing)}
                    disabled={!activePairing.linkUrl}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedPairingId === activePairing.id ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {whatsAppPairings.length > 1 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Pairings</p>
              <div className="mt-2 space-y-1">
                {whatsAppPairings.slice(0, 5).map((pairing) => (
                  <div key={pairing.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-600">{pairing.code}</span>
                    <span className="text-slate-500">{pairing.status}</span>
                    <span className="text-slate-400">expires {timeUntil(pairing.expiresAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Authorized WhatsApp Senders</h2>
          <p className="text-sm text-slate-500">Paired phones and manually allowlisted senders can route messages into your agent conversation.</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_1fr_auto]">
            <input
              value={allowlistPhone}
              onChange={(event) => setAllowlistPhone(event.target.value)}
              placeholder="whatsapp:+15551234567"
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <input
              value={allowlistLabel}
              onChange={(event) => setAllowlistLabel(event.target.value)}
              placeholder="Label (optional)"
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="button"
              onClick={() => void handleAllowlistDevice()}
              disabled={isAllowlistingDevice}
              className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAllowlistingDevice ? 'Saving...' : 'Allow Sender'}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {whatsAppDevices.length === 0 && (
              <p className="text-sm text-slate-500">No authorized senders yet.</p>
            )}
            {whatsAppDevices.map((device) => (
              <div key={device.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{device.label ?? device.phone}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          device.source === 'paired'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {device.source === 'paired' ? 'paired' : 'allowlisted'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{device.phone}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      authorized {timeAgo(device.linkedAt)} | last seen {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'n/a'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnlinkDevice(device.id)}
                    disabled={unlinkingDeviceId === device.id}
                    className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {unlinkingDeviceId === device.id ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* ─── Telegram ─────────────────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Telegram Pairing</h2>
              <p className="text-sm text-slate-500">
                Generate a pairing code, then send <code className="rounded bg-slate-100 px-1 text-xs">/link OA-XXXXXX</code> to your bot in Telegram to link the chat.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${telegramHealth?.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {telegramHealth?.configured ? 'enabled' : 'planned'}
            </span>
          </div>

          {!telegramHealth?.configured && (
            <p className="mt-2 text-xs text-amber-700">Set <code className="rounded bg-amber-50 px-1">TELEGRAM_BOT_TOKEN</code> to enable Telegram. Create a bot at @BotFather on Telegram.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleCreateTelegramPairing()} disabled={isCreatingTelegramPairing || !telegramHealth?.configured}
              className="h-9 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isCreatingTelegramPairing ? 'Generating...' : 'Generate Pairing Code'}
            </button>
          </div>

          {telegramPairings.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Pairings</p>
              <div className="mt-2 space-y-1">
                {telegramPairings.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <code className="font-mono text-slate-700">{p.command}</code>
                    <span className="text-slate-500">{p.status}</span>
                    <span className="text-slate-400">expires {timeUntil(p.expiresAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-600">Register Webhook</p>
            <p className="mt-1 text-xs text-slate-500">Point Telegram at your server so it can deliver messages. URL must be HTTPS.</p>
            <div className="mt-2 flex gap-2">
              <input value={telegramWebhookUrl} onChange={(e) => setTelegramWebhookUrl(e.target.value)}
                placeholder="https://yourdomain.com/api/v1/channels/telegram/webhook"
                className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100" />
              <button type="button" onClick={() => void handleRegisterTelegramWebhook()} disabled={isRegisteringTelegramWebhook || !telegramHealth?.configured}
                className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                {isRegisteringTelegramWebhook ? 'Registering...' : 'Register'}
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Linked Telegram Chats</h2>
          <p className="text-sm text-slate-500">Chats paired via code can send messages to your agent.</p>
          <div className="mt-3 space-y-2">
            {telegramChats.length === 0 && <p className="text-sm text-slate-500">No linked chats yet.</p>}
            {telegramChats.map((chat) => (
              <div key={chat.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{chat.label ?? chat.chatId}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">chat_id: {chat.chatId}</p>
                    <p className="mt-1 text-xs text-slate-500">linked {timeAgo(chat.linkedAt)} | last seen {chat.lastSeenAt ? timeAgo(chat.lastSeenAt) : 'n/a'}</p>
                  </div>
                  <button type="button" onClick={() => void handleUnlinkTelegramChat(chat.id)} disabled={unlinkingTelegramChatId === chat.id}
                    className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {unlinkingTelegramChatId === chat.id ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* ─── Slack ────────────────────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Slack Pairing</h2>
              <p className="text-sm text-slate-500">
                Generate a code and send it in a Slack channel where your bot is present to link that workspace.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${slackHealth?.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {slackHealth?.configured ? 'enabled' : 'planned'}
            </span>
          </div>

          {!slackHealth?.configured && (
            <p className="mt-2 text-xs text-amber-700">Set <code className="rounded bg-amber-50 px-1">SLACK_BOT_TOKEN</code> and <code className="rounded bg-amber-50 px-1">SLACK_SIGNING_SECRET</code>. Create a Slack App at api.slack.com and enable the Events API.</p>
          )}
          {slackHealth?.configured && !slackHealth.signingSecretEnabled && (
            <p className="mt-2 text-xs text-amber-700">Signing secret not set — webhook requests are not verified. Set <code className="rounded bg-amber-50 px-1">SLACK_SIGNING_SECRET</code>.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleCreateSlackPairing()} disabled={isCreatingSlackPairing || !slackHealth?.configured}
              className="h-9 rounded-lg bg-purple-500 px-3 text-xs font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isCreatingSlackPairing ? 'Generating...' : 'Generate Pairing Code'}
            </button>
          </div>

          {slackPairings.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Pairings</p>
              <div className="mt-2 space-y-1">
                {slackPairings.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <code className="font-mono text-slate-700">{p.command}</code>
                    <span className="text-slate-500">{p.status}</span>
                    <span className="text-slate-400">expires {timeUntil(p.expiresAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold">Setup</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Create a Slack App and add a bot with <code>chat:write</code>, <code>channels:history</code>, <code>im:history</code> scopes.</li>
              <li>Set the Events API Request URL to <code>/api/v1/channels/slack/webhook</code>.</li>
              <li>Subscribe to <code>message.channels</code> and <code>message.im</code> events.</li>
              <li>Generate a code above and paste it in the Slack channel.</li>
            </ol>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Linked Slack Workspaces</h2>
          <p className="text-sm text-slate-500">Each linked workspace can route messages to your agent.</p>
          <div className="mt-3 space-y-2">
            {slackWorkspaces.length === 0 && <p className="text-sm text-slate-500">No linked workspaces yet.</p>}
            {slackWorkspaces.map((ws) => (
              <div key={ws.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{ws.teamName ?? ws.teamId}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">team: {ws.teamId}{ws.channelId ? ` | channel: ${ws.channelId}` : ''}</p>
                    <p className="mt-1 text-xs text-slate-500">linked {timeAgo(ws.linkedAt)} | last seen {ws.lastSeenAt ? timeAgo(ws.lastSeenAt) : 'n/a'}</p>
                  </div>
                  <button type="button" onClick={() => void handleUnlinkSlackWorkspace(ws.id)} disabled={unlinkingSlackWorkspaceId === ws.id}
                    className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {unlinkingSlackWorkspaceId === ws.id ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* ─── Discord ──────────────────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Discord Pairing</h2>
              <p className="text-sm text-slate-500">
                Link a Discord server via slash command. Users run <code className="rounded bg-slate-100 px-1 text-xs">/link OA-XXXXXX</code> after you generate a code.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${discordHealth?.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {discordHealth?.configured ? 'enabled' : 'planned'}
            </span>
          </div>

          {!discordHealth?.configured && (
            <p className="mt-2 text-xs text-amber-700">Set <code className="rounded bg-amber-50 px-1">DISCORD_BOT_TOKEN</code> and <code className="rounded bg-amber-50 px-1">DISCORD_PUBLIC_KEY</code>. Create an Application at discord.com/developers.</p>
          )}
          {discordHealth?.configured && !discordHealth.publicKeyEnabled && (
            <p className="mt-2 text-xs text-amber-700">Public key not set — interaction signatures are not verified. Set <code className="rounded bg-amber-50 px-1">DISCORD_PUBLIC_KEY</code>.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleCreateDiscordPairing()} disabled={isCreatingDiscordPairing || !discordHealth?.configured}
              className="h-9 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isCreatingDiscordPairing ? 'Generating...' : 'Generate Pairing Code'}
            </button>
          </div>

          {discordPairings.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Pairings</p>
              <div className="mt-2 space-y-1">
                {discordPairings.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <code className="font-mono text-slate-700">{p.command}</code>
                    <span className="text-slate-500">{p.status}</span>
                    <span className="text-slate-400">expires {timeUntil(p.expiresAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold">Setup</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Create a Discord Application and Bot. Enable <code>Message Content Intent</code>.</li>
              <li>Set the Interactions Endpoint URL to <code>/api/v1/channels/discord/webhook</code>.</li>
              <li>Register slash commands: <code>/link</code> (code: string), <code>/ask</code> (message: string).</li>
              <li>Invite the bot to your server, generate a code, and run <code>/link OA-XXXXXX</code>.</li>
            </ol>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Linked Discord Servers</h2>
          <p className="text-sm text-slate-500">Each linked server can use <code>/ask</code> to chat with your agent.</p>
          <div className="mt-3 space-y-2">
            {discordServers.length === 0 && <p className="text-sm text-slate-500">No linked servers yet.</p>}
            {discordServers.map((server) => (
              <div key={server.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{server.guildName ?? server.guildId}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">guild: {server.guildId}</p>
                    <p className="mt-1 text-xs text-slate-500">linked {timeAgo(server.linkedAt)} | last seen {server.lastSeenAt ? timeAgo(server.lastSeenAt) : 'n/a'}</p>
                  </div>
                  <button type="button" onClick={() => void handleUnlinkDiscordServer(server.id)} disabled={unlinkingDiscordServerId === server.id}
                    className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {unlinkingDiscordServerId === server.id ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {CHANNEL_GROUPS.map((group) => {
          const groupTools = toolsByGroup.get(group.id) ?? []
          return (
            <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{group.label}</h2>
                  <p className="text-sm text-slate-500">{group.description}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {groupTools.length} tools
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {groupTools.length === 0 && (
                  <p className="text-sm text-slate-500">No tools registered for this connector.</p>
                )}
                {groupTools.map((tool) => (
                  <div key={tool.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{tool.displayName}</p>
                        <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">{tool.name}</p>
                        {tool.source === 'mcp' && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            server: <span className="font-mono">{tool.serverId ?? 'unknown'}</span>
                            {tool.originalName ? ` | original: ${tool.originalName}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            tool.requiresApproval
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {tool.requiresApproval ? 'approval' : 'direct'}
                        </span>
                        {tool.source === 'mcp' && (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            MCP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
