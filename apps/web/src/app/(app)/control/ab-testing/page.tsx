'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Plus, Trash2, Trophy } from 'lucide-react'

interface AbTestVariant {
  id: string
  name: string
  systemPrompt: string
  model?: string
}

interface AbTestResult {
  runs: number
  avgLatencyMs: number
  avgTokens: number
  satisfactionScore: number
}

interface AbTest {
  id: string
  name: string
  description?: string
  variants: AbTestVariant[]
  winnerVariantId?: string
  status: 'running' | 'paused' | 'completed'
  createdAt: string
  results: Record<string, AbTestResult>
}

export default function AbTestingPage() {
  const [tests, setTests] = useState<AbTest[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [variants, setVariants] = useState([
    { name: 'Variant A', systemPrompt: '', model: 'gpt-4.1' },
    { name: 'Variant B', systemPrompt: '', model: 'claude-sonnet-4-5-20250929' },
  ])

  async function loadTests() {
    setLoading(true)
    try {
      const res = await fetch('/api/ab-tests', { credentials: 'include' })
      if (res.ok) setTests(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTests() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc, variants }),
        credentials: 'include',
      })
      if (res.ok) {
        setNewName('')
        setNewDesc('')
        await loadTests()
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleSetWinner(testId: string, variantId: string) {
    await fetch(`/api/ab-tests/${testId}/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId }),
      credentials: 'include',
    })
    await loadTests()
  }

  async function handleDelete(testId: string) {
    await fetch(`/api/ab-tests/${testId}`, { method: 'DELETE', credentials: 'include' })
    await loadTests()
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={22} className="text-violet-400" />
          Prompt A/B Testing
        </h1>
        <p className="text-sm text-white/50 mt-0.5">Compare agent preset variants to find the best performing prompt</p>
      </div>

      {/* Create new test */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Plus size={15} /> New A/B Test
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Test name (e.g. Concise vs Verbose)"
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
          />
        </div>
        {variants.map((v, i) => (
          <div key={i} className="space-y-2">
            <p className="text-xs text-white/50 font-medium">{v.name}</p>
            <textarea
              value={v.systemPrompt}
              onChange={e => {
                const next = [...variants]
                next[i] = { ...next[i], systemPrompt: e.target.value }
                setVariants(next)
              }}
              placeholder={`System prompt for ${v.name}…`}
              rows={3}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 resize-none"
            />
          </div>
        ))}
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          <Plus size={14} />
          {creating ? 'Creating…' : 'Create Test'}
        </button>
      </div>

      {/* Tests list */}
      {tests.length === 0 && !loading && (
        <p className="text-center text-white/30 text-sm py-8">No A/B tests yet. Create one above.</p>
      )}

      {tests.map(test => (
        <div key={test.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-white">{test.name}</h3>
              {test.description && <p className="text-sm text-white/40 mt-0.5">{test.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                test.status === 'running' ? 'bg-emerald-900/40 text-emerald-300' :
                test.status === 'completed' ? 'bg-amber-900/40 text-amber-300' :
                'bg-slate-700/40 text-slate-300'
              }`}>
                {test.status}
              </span>
              <button
                onClick={() => handleDelete(test.id)}
                className="rounded-lg p-1.5 text-white/30 hover:text-rose-400 hover:bg-rose-900/20 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {test.variants.map(v => {
              const r = test.results[v.id] ?? { runs: 0, avgLatencyMs: 0, avgTokens: 0, satisfactionScore: 0 }
              const isWinner = test.winnerVariantId === v.id
              return (
                <div
                  key={v.id}
                  className={`rounded-xl border p-4 space-y-2 ${isWinner ? 'border-amber-600/60 bg-amber-900/10' : 'border-white/10 bg-white/[0.02]'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white text-sm">{v.name}</span>
                    {isWinner && <span className="flex items-center gap-1 text-amber-400 text-xs"><Trophy size={12} /> Winner</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/50">
                    <span>Runs: <span className="text-white/80">{r.runs}</span></span>
                    <span>Avg latency: <span className="text-white/80">{r.avgLatencyMs.toFixed(0)}ms</span></span>
                    <span>Avg tokens: <span className="text-white/80">{r.avgTokens.toFixed(0)}</span></span>
                    <span>Score: <span className="text-white/80">{r.satisfactionScore.toFixed(2)}</span></span>
                  </div>
                  {test.status === 'running' && !test.winnerVariantId && (
                    <button
                      onClick={() => handleSetWinner(test.id, v.id)}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1"
                    >
                      <Trophy size={11} /> Set as winner
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
