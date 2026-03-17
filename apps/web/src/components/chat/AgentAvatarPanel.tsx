'use client'

import clsx from 'clsx'
import type { CSSProperties } from 'react'
import type { Message } from '@openagents/shared'
import { Activity, BrainCircuit, Mic, Sparkles, Volume2 } from 'lucide-react'

interface AgentAvatarPanelProps {
  gatewayConnected: boolean
  isStreaming: boolean
  messages: Message[]
  runStatus: string | null
}

function compactText(value: string | null | undefined, max: number) {
  if (!value) return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max).trimEnd()}...`
}

function formatStatusLabel(status: string | null | undefined) {
  if (!status) return null
  const normalized = status.replace(/[_-]+/g, ' ').trim()
  if (!normalized) return null
  return normalized
}

const AVATAR_NEURAL_NODES = [
  { x: '50%', y: '14%', size: '6px', delay: '0s' },
  { x: '33%', y: '20%', size: '5px', delay: '0.2s' },
  { x: '67%', y: '21%', size: '5px', delay: '0.45s' },
  { x: '24%', y: '31%', size: '4px', delay: '0.65s' },
  { x: '76%', y: '31%', size: '4px', delay: '0.3s' },
  { x: '38%', y: '37%', size: '5px', delay: '0.1s' },
  { x: '62%', y: '37%', size: '5px', delay: '0.55s' },
  { x: '50%', y: '46%', size: '6px', delay: '0.8s' },
  { x: '34%', y: '56%', size: '4px', delay: '0.25s' },
  { x: '66%', y: '56%', size: '4px', delay: '0.7s' },
  { x: '42%', y: '66%', size: '5px', delay: '0.4s' },
  { x: '58%', y: '66%', size: '5px', delay: '0.9s' },
  { x: '29%', y: '80%', size: '4px', delay: '0.15s' },
  { x: '71%', y: '80%', size: '4px', delay: '0.5s' },
]

export function AgentAvatarPanel({
  gatewayConnected,
  isStreaming,
  messages,
  runStatus,
}: AgentAvatarPanelProps) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === 'user' && message.content.trim())
      ?.content ?? ''
  const latestAgentMessage =
    [...messages].reverse().find((message) => message.role === 'agent' && message.content.trim())
      ?.content ?? ''
  const statusLabel = !gatewayConnected
    ? 'offline'
    : isStreaming
      ? (formatStatusLabel(runStatus) ?? 'thinking')
      : messages.length === 0
        ? 'standby'
        : 'ready'

  const modeCopy = !gatewayConnected
    ? 'Reconnect the gateway to wake the avatar.'
    : isStreaming
      ? 'Avatar motion is synced to the active response loop.'
      : latestAgentMessage
        ? 'The companion is holding context and waiting for the next cue.'
        : 'Voice shell is idling until the first exchange starts.'

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] dark:text-[var(--muted)]">
              Assistant status
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
              Execution console
            </p>
          </div>

          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
              !gatewayConnected
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                : isStreaming
                  ? 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] dark:text-[var(--muted)]',
            )}
          >
            <Activity size={11} />
            {statusLabel}
          </span>
        </div>

        <p className="mt-2 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
          Live readout of context, tool activity, and response-loop state for the current task.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div
          className={clsx(
            'oa-avatar-stage relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-[var(--border)] px-5 py-6',
            isStreaming && 'oa-avatar-stage--active',
            !gatewayConnected && 'oa-avatar-stage--offline',
          )}
        >
          <div className="oa-avatar-grid" />
          <div className="oa-avatar-scan" />
          <div className="oa-avatar-ring oa-avatar-ring--outer" />
          <div className="oa-avatar-ring oa-avatar-ring--middle oa-avatar-ring--reverse" />
          <div className="oa-avatar-ring oa-avatar-ring--inner" />
          <div
            className={clsx(
              'oa-avatar-aura',
              isStreaming && 'oa-avatar-aura--active',
              !gatewayConnected && 'oa-avatar-aura--offline',
            )}
          />

          <div className="oa-avatar-core-shell">
            <div className="oa-avatar-pedestal" />

            <div className={clsx('oa-avatar-bust', !gatewayConnected && 'oa-avatar-bust--offline')}>
              <div className="oa-avatar-shoulders">
                <div className="oa-avatar-shoulder-mesh" />
              </div>

              <div className="oa-avatar-neck" />

              <div className={clsx('oa-avatar-head', !gatewayConnected && 'oa-avatar-head--offline')}>
                <div className="oa-avatar-head-sheen" />
                <div className="oa-avatar-head-mesh" />
                <div className="oa-avatar-face-map" />
                <div className="oa-avatar-brow-line" />

                <div className="oa-avatar-eye-track">
                  <span className="oa-avatar-eye-node" />
                  <span className="oa-avatar-eye-node" />
                </div>

                <div className="oa-avatar-nose-line" />
                <div className="oa-avatar-mouth-line" />

                {AVATAR_NEURAL_NODES.map((node, index) => (
                  <span
                    key={`${node.x}-${node.y}-${index}`}
                    className="oa-avatar-neural-dot"
                    style={
                      {
                        '--x': node.x,
                        '--y': node.y,
                        '--size': node.size,
                        '--delay': node.delay,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2">
            {[
              {
                icon: Mic,
                label: 'Voice',
                value: gatewayConnected ? (isStreaming ? 'hot mic' : 'armed') : 'offline',
              },
              {
                icon: BrainCircuit,
                label: 'Context',
                value: messages.length > 0 ? 'loaded' : 'blank',
              },
              {
                icon: Volume2,
                label: 'Output',
                value: latestAgentMessage ? 'primed' : 'silent',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.42)] px-2.5 py-2 backdrop-blur-sm dark:bg-[rgba(16,9,15,0.34)]"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon size={12} className="text-[var(--accent)]" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] dark:text-[var(--muted)]">
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                    {item.value}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] dark:text-[var(--muted)]">
            Last cue
          </p>
          <p className="mt-2 text-sm text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            {latestUserMessage ? compactText(latestUserMessage, 120) : 'Waiting for the first task.'}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-[var(--accent)]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] dark:text-[var(--muted)]">
              Presence
            </p>
          </div>
          <p className="mt-2 text-sm text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            {modeCopy}
          </p>
          {latestAgentMessage && (
            <p className="mt-2 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
              Latest response: {compactText(latestAgentMessage, 140)}
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}
