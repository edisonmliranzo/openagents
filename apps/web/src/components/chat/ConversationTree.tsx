'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GitBranch, ArrowLeftRight } from 'lucide-react'
import { sdk } from '@/stores/auth'

export interface ConversationTreeNode {
  id: string
  title: string | null
  parentId: string | null
  fromMessageId: string | null
  messageCount: number
  createdAt: string
  lastMessageAt: string | null
  children: ConversationTreeNode[]
}

interface ConversationTreeProps {
  conversationId: string
  onSelectConversation?: (id: string) => void
}

export function ConversationTree({ conversationId, onSelectConversation }: ConversationTreeProps) {
  const [root, setRoot] = useState<ConversationTreeNode | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    sdk.client
      .get<{ root: ConversationTreeNode | null }>(`/api/v1/conversations/${conversationId}/tree`)
      .then((res) => setRoot(res.root))
      .catch(() => setRoot(null))
      .finally(() => setLoading(false))
  }, [conversationId])

  if (loading) {
    return <div className="p-3 text-xs text-slate-400">Loading branch tree…</div>
  }
  if (!root) return null

  function renderNode(node: ConversationTreeNode, depth = 0) {
    const active = node.id === conversationId
    return (
      <div key={node.id} className="space-y-1">
        <div
          style={{ marginLeft: depth * 14 }}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
            active ? 'bg-emerald-500/20 text-emerald-300 font-medium' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <button
            type="button"
            onClick={() => onSelectConversation?.(node.id)}
            className="flex items-center gap-1.5 truncate text-left"
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{node.title || 'Untitled branch'}</span>
            <span className="text-[10px] text-slate-500">({node.messageCount})</span>
          </button>
          {!active && (
            <Link
              href={`/compare?left=${encodeURIComponent(conversationId)}&right=${encodeURIComponent(node.id)}`}
              className="ml-2 inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
              title="Compare side-by-side"
            >
              <ArrowLeftRight className="h-3 w-3" /> Compare
            </Link>
          )}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-emerald-400" /> Time-Travel Branches
        </span>
        <Link href={`/compare?left=${encodeURIComponent(conversationId)}`} className="text-[11px] text-emerald-400 hover:underline">
          Open Compare View
        </Link>
      </div>
      {renderNode(root)}
    </div>
  )
}

export default ConversationTree
