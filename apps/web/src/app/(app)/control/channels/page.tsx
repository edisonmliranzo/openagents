'use client'

import { sdk } from '@/stores/auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Notification,
  WhatsAppChannelHealth,
  WhatsAppDeviceLink,
  WhatsAppPairingSession,
} from '@openagents/shared'

interface ConnectorTool {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
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
  { id: 'other', label: 'Other', description: 'Additional connector capabilities' },
]

function inferGroupId(toolName: string) {
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
  const [whatsAppHealth, setWhatsAppHealth] = useState<WhatsAppChannelHealth | null>(null)
  const [whatsAppDevices, setWhatsAppDevices] = useState<WhatsAppDeviceLink[]>([])
  const [whatsAppPairings, setWhatsAppPairings] = useState<WhatsAppPairingSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreatingPairing, setIsCreatingPairing] = useState(false)
  const [unlinkingDeviceId, setUnlinkingDeviceId] = useState<string | null>(null)
  const [pairingExpiryMinutes, setPairingExpiryMinutes] = useState(15)
  const [copiedPairingId, setCopiedPairingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [toolList, approvals, notifications, health, devices, pairings] = await Promise.all([
        sdk.tools.list(),
        sdk.approvals.list('pending'),
        sdk.notifications.list(),
        sdk.channels.whatsappHealth(),
        sdk.channels.listWhatsAppDevices(),
        sdk.channels.listWhatsAppPairings(),
      ])
      setTools(toolList)
      setPendingApprovals(approvals.length)
      setLatestNotification(notifications[0] ?? null)
      setWhatsAppHealth(health)
      setWhatsAppDevices(devices)
      setWhatsAppPairings(pairings)
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
      const groupId = inferGroupId(tool.name)
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
                Generate a one-time code, then scan/open link on a phone to pair that device.
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
          <h2 className="text-lg font-semibold text-slate-900">Linked WhatsApp Devices</h2>
          <p className="text-sm text-slate-500">Messages from linked phones route to your agent conversation.</p>

          <div className="mt-3 space-y-2">
            {whatsAppDevices.length === 0 && (
              <p className="text-sm text-slate-500">No linked devices yet.</p>
            )}
            {whatsAppDevices.map((device) => (
              <div key={device.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{device.label ?? device.phone}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{device.phone}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      linked {timeAgo(device.linkedAt)} | last seen {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'n/a'}
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
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          tool.requiresApproval
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {tool.requiresApproval ? 'approval' : 'direct'}
                      </span>
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
