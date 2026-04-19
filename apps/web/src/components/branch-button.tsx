'use client'

import { useState } from 'react'
import { GitBranch } from 'lucide-react'

interface BranchButtonProps {
  /** The conversation (session) ID to branch from */
  sessionId: string
  /** The index of the message to branch from (messages up to this index are copied) */
  messageIndex: number
  /** Called with the new session ID when branching succeeds */
  onBranched?: (newSessionId: string) => void
}

export function BranchButton({ sessionId, messageIndex, onBranched }: BranchButtonProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleBranch() {
    if (loading || done) return
    const prompt = window.prompt('Continue this branch with a new prompt:')
    if (!prompt) return
    setLoading(true)
    try {
      const res = await fetch('/api/agent/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fromMessageIndex: messageIndex, prompt }),
        credentials: 'include',
      })
      const data = await res.json() as { branchSessionId?: string }
      if (data.branchSessionId) {
        setDone(true)
        onBranched?.(data.branchSessionId)
        window.location.href = `/chat?conversation=${data.branchSessionId}`
      }
    } catch {
      // ignore errors silently
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleBranch()}
      disabled={loading}
      title="Branch conversation from here"
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#98a2b3] hover:text-[#667085] hover:bg-[#f2f4f7] dark:hover:text-[#c9d1e0] dark:hover:bg-[#1e2433] transition-all opacity-0 group-hover:opacity-100"
    >
      <GitBranch size={12} />
      {loading ? 'Branching…' : done ? 'Branched!' : 'Branch'}
    </button>
  )
}
