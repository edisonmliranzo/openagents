'use client'

import clsx from 'clsx'
import type { CSSProperties } from 'react'
import type { Message } from '@openagents/shared'
import { Activity, Sparkles } from 'lucide-react'

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

const ORB_RIBBONS = [
  { rotation: '-18deg', width: '84%', height: '20%', delay: '0s', tone: 'cyan' },
  { rotation: '24deg', width: '80%', height: '24%', delay: '0.25s', tone: 'violet' },
  { rotation: '72deg', width: '86%', height: '18%', delay: '0.4s', tone: 'pink' },
  { rotation: '126deg', width: '74%', height: '22%', delay: '0.15s', tone: 'mint' },
  { rotation: '162deg', width: '82%', height: '18%', delay: '0.32s', tone: 'cyan' },
]

const ORB_PARTICLES = [
  { x: '18%', y: '28%', size: '4px', delay: '0.2s' },
  { x: '79%', y: '22%', size: '5px', delay: '0.5s' },
  { x: '84%', y: '54%', size: '3px', delay: '0.8s' },
  { x: '22%', y: '72%', size: '4px', delay: '0.1s' },
  { x: '70%', y: '78%', size: '5px', delay: '0.65s' },
  { x: '50%', y: '12%', size: '4px', delay: '0.35s' },
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

          <div
            className={clsx(
              'oa-avatar-orb-shell',
              isStreaming && 'oa-avatar-orb-shell--active',
              !gatewayConnected && 'oa-avatar-orb-shell--offline',
            )}
          >
            <div className="oa-avatar-orb-core">
              <div className="oa-avatar-orb-haze oa-avatar-orb-haze--cyan" />
              <div className="oa-avatar-orb-haze oa-avatar-orb-haze--violet" />
              <div className="oa-avatar-orb-haze oa-avatar-orb-haze--pink" />

              {ORB_RIBBONS.map((ribbon, index) => (
                <div
                  key={`${ribbon.rotation}-${index}`}
                  className="oa-avatar-orb-layer"
                  style={
                    {
                      '--rotation': ribbon.rotation,
                      '--delay': ribbon.delay,
                    } as CSSProperties
                  }
                >
                  <span
                    className={clsx('oa-avatar-orb-ribbon', `oa-avatar-orb-ribbon--${ribbon.tone}`)}
                    style={
                      {
                        '--w': ribbon.width,
                        '--h': ribbon.height,
                      } as CSSProperties
                    }
                  />
                </div>
              ))}

              {ORB_PARTICLES.map((particle, index) => (
                <span
                  key={`${particle.x}-${particle.y}-${index}`}
                  className="oa-avatar-orb-particle"
                  style={
                    {
                      '--x': particle.x,
                      '--y': particle.y,
                      '--size': particle.size,
                      '--delay': particle.delay,
                    } as CSSProperties
                  }
                />
              ))}

              <div className="oa-avatar-orb-sheen" />
              <div className="oa-avatar-orb-center" />
              <div className="oa-avatar-orb-core-glow" />
            </div>
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
