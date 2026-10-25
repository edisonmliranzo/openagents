'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeftRight, GitBranch, Plus } from 'lucide-react'
import { sdk } from '@/stores/auth'

interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
}

interface MessageItem {
  id: string
  role: string
  content: string
  createdAt: string
}

function TimeTravelCompareInner() {
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [leftId, setLeftId] = useState(searchParams?.get('left') ?? '')
  const [rightId, setRightId] = useState(searchParams?.get('right') ?? '')
  const [leftMsgs, setLeftMsgs] = useState<MessageItem[]>([])
  const [rightMsgs, setRightMsgs] = useState<MessageItem[]>([])
  const [branchStatus, setBranchStatus] = useState<string | null>(null)

  useEffect(() => {
    sdk.client
      .get<ConversationSummary[]>('/api/v1/conversations')
      .then((list) => {
        setConversations(list)
        if (!leftId && list[0]) setLeftId(list[0].id)
        if (!rightId && list[1]) setRightId(list[1].id)
      })
      .catch(() => undefined)
  }, [leftId, rightId])

  useEffect(() => {
    if (!leftId) return
    sdk.client
      .get<MessageItem[]>(`/api/v1/conversations/${leftId}/messages`)
      .then(setLeftMsgs)
      .catch(() => setLeftMsgs([]))
  }, [leftId])

  useEffect(() => {
    if (!rightId) return
    sdk.client
      .get<MessageItem[]>(`/api/v1/conversations/${rightId}/messages`)
      .then(setRightMsgs)
      .catch(() => setRightMsgs([]))
  }, [rightId])

  async function handleBranchFrom(conversationId: string, messageId: string) {
    setBranchStatus('Creating branch…')
    try {
      const res = await sdk.client.post<{ conversation: { id: string; title: string } }>(
        `/api/v1/conversations/${conversationId}/branch`,
        { fromMessageId: messageId },
      )
      const list = await sdk.client.get<ConversationSummary[]>('/api/v1/conversations')
      setConversations(list)
      setRightId(res.conversation.id)
      setBranchStatus(`Branched into "${res.conversation.title}"`)
    } catch (e: any) {
      setBranchStatus(e?.message || 'Failed to branch')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ArrowLeftRight className="h-6 w-6 text-emerald-400" /> Time-Travel Chat &amp; Branch Compare
          </h1>
          <p className="text-sm text-slate-400">
            Branch any conversation from any message and compare alternate timelines side by side.
          </p>
        </div>
        {branchStatus && (
          <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
            {branchStatus}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { label: 'Left Timeline', id: leftId, setId: setLeftId, msgs: leftMsgs },
          { label: 'Right Timeline', id: rightId, setId: setRightId, msgs: rightMsgs },
        ].map((pane, idx) => (
          <div key={idx} className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{pane.label}</span>
              <select
                value={pane.id}
                onChange={(e) => pane.setId(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">Select conversation…</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-[65vh] flex-1 space-y-3 overflow-y-auto pr-1">
              {pane.msgs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">No messages in this timeline.</div>
              ) : (
                pane.msgs.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold uppercase text-emerald-400">{m.role}</span>
                      <button
                        type="button"
                        onClick={() => handleBranchFrom(pane.id, m.id)}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
                        title="Branch conversation from this point"
                      >
                        <GitBranch className="h-3 w-3 text-emerald-400" />
                        <Plus className="h-2.5 w-2.5" /> Branch here
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-slate-200">{m.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TimeTravelComparePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl p-6 text-xs text-slate-400">Loading timelines…</div>}>
      <TimeTravelCompareInner />
    </Suspense>
  )
}
