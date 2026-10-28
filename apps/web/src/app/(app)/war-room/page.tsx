'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Bot,
  FileCode2,
  Loader2,
  MessagesSquare,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  User,
  Users,
} from 'lucide-react'
import type {
  MultiplayerWarRoomState,
  WarRoomParticipant,
  WarRoomTurn,
} from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

export default function MultiplayerWarRoomPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [room, setRoom] = useState<MultiplayerWarRoomState | null>(null)
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [savingCanvas, setSavingCanvas] = useState(false)

  const [message, setMessage] = useState('')
  const [inviteSpecialists, setInviteSpecialists] = useState(true)
  const [canvasDraft, setCanvasDraft] = useState('')

  // Quick-pin card helper that appends structured cards to the shared War Room canvas
  const [cardTitle, setCardTitle] = useState('')
  const [cardKind, setCardKind] = useState<'architecture' | 'incident' | 'decision' | 'code_patch'>('decision')
  const [cardSummary, setCardSummary] = useState('')

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getWarRoomState()
      setRoom(res)
      setCanvasDraft(res.sharedCanvasMarkdown)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Multiplayer War Room')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handlePostTurn(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setPosting(true)
    try {
      const res = await sdk.agenticSuite.postWarRoomTurn({
        message: message.trim(),
        inviteSpecialists,
      })
      setRoom(res)
      setMessage('')
      addToast('success', 'Dispatched turn to War Room specialists')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to post War Room turn')
    } finally {
      setPosting(false)
    }
  }

  async function handleSaveCanvas(markdownToSave?: string) {
    const nextMd = markdownToSave ?? canvasDraft
    setSavingCanvas(true)
    try {
      const res = await sdk.agenticSuite.updateWarRoomCanvas({
        sharedCanvasMarkdown: nextMd,
      })
      setRoom(res)
      setCanvasDraft(res.sharedCanvasMarkdown)
      addToast('success', 'Synced shared War Room canvas')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update shared canvas')
    } finally {
      setSavingCanvas(false)
    }
  }

  async function handlePinCard(e: React.FormEvent) {
    e.preventDefault()
    if (!cardTitle.trim() || !cardSummary.trim()) {
      addToast('warning', 'Card title and summary are required')
      return
    }
    const block = `\n\n### 📌 [${cardKind.toUpperCase()}] ${cardTitle.trim()}\n${cardSummary.trim()}`
    const updatedMd = `${canvasDraft}${block}`
    setCardTitle('')
    setCardSummary('')
    await handleSaveCanvas(updatedMd)
  }

  const participants: WarRoomParticipant[] = room?.participants ?? []
  const turns: WarRoomTurn[] = room?.turns ?? []

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {room?.title ?? 'OpenAgents Multiplayer Live War Room & Shared Agent Canvas'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Coordinated multi-human + multi-specialist (@Forge, @Scout, @Sentinel, @Atlas) operational command room with live shared markdown canvas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
              <span className="text-[10px] text-slate-400">({p.role})</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void loadState()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Multi-Agent Live Turn Stream */}
        <div className="space-y-4 lg:col-span-7">
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Specialist Turn Stream ({turns.length})
                </h2>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={inviteSpecialists}
                  onChange={(e) => setInviteSpecialists(e.target.checked)}
                  className="accent-indigo-500"
                />
                Auto-trigger @Forge &amp; @Sentinel responses
              </label>
            </div>

            <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {turns.map((turn) => {
                const isHuman = turn.authorKind === 'human'
                return (
                  <div
                    key={turn.id}
                    className={`rounded-xl border p-3.5 ${
                      isHuman
                        ? 'border-indigo-500/30 bg-indigo-500/10'
                        : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isHuman ? (
                          <User className="h-3.5 w-3.5 text-indigo-400" />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-cyan-400" />
                        )}
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {turn.authorName}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {turn.roleBadge}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(turn.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {turn.content}
                    </p>
                  </div>
                )
              })}
            </div>

            <form onSubmit={handlePostTurn} className="mt-4 flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Broadcast directive to @Forge, @Scout, @Sentinel & @Atlas..."
                className="h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={posting || !message.trim()}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 text-xs font-semibold text-white hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Broadcast Turn
              </button>
            </form>
          </section>
        </div>

        {/* Right: Shared Operational Canvas + Pin Decision Card */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Shared Agent Canvas (Markdown)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveCanvas()}
                disabled={savingCanvas}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {savingCanvas ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Canvas
              </button>
            </div>

            <textarea
              rows={12}
              value={canvasDraft}
              onChange={(e) => setCanvasDraft(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-3 flex items-center gap-2">
              <Pin className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pin Card to Shared Canvas
              </h2>
            </div>

            <form onSubmit={handlePinCard} className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  placeholder="Card title..."
                  className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900 outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <select
                  value={cardKind}
                  onChange={(e) => setCardKind(e.target.value as any)}
                  className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="decision">decision</option>
                  <option value="architecture">architecture</option>
                  <option value="incident">incident</option>
                  <option value="code_patch">code_patch</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={cardSummary}
                onChange={(e) => setCardSummary(e.target.value)}
                placeholder="Summary or architectural invariant to pin..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={savingCanvas || !cardTitle.trim() || !cardSummary.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Pin Card to War Room Canvas
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
