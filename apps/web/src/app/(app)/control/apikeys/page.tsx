'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Key } from 'lucide-react'

interface ApiKeyHealth {
  name: string
  envVar: string
  configured: boolean
  masked: string
  lastChecked: string | null
  status: 'healthy' | 'missing' | 'unknown'
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [rotating, setRotating] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function loadHealth() {
    setLoading(true)
    try {
      const res = await fetch('/api/apikeys/health', { credentials: 'include' })
      if (res.ok) setKeys(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHealth() }, [])

  async function handleRotate(envVar: string) {
    const newValue = window.prompt(`Enter new value for ${envVar}:`)
    if (!newValue) return
    setRotating(envVar)
    setMessage('')
    try {
      const res = await fetch('/api/apikeys/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVar, newValue }),
        credentials: 'include',
      })
      const data = await res.json()
      setMessage(data.message ?? 'Done')
      await loadHealth()
    } finally {
      setRotating(null)
    }
  }

  const healthy = keys.filter(k => k.configured).length
  const missing = keys.filter(k => !k.configured).length

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Key size={22} className="text-indigo-400" />
            API Key Health
          </h1>
          <p className="text-sm text-white/50 mt-0.5">{healthy} configured · {missing} missing</p>
        </div>
        <button
          onClick={loadHealth}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-900/40 border border-emerald-700/50 px-4 py-3 text-sm text-emerald-300">
          {message}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-4 py-3 text-white/50 font-medium">Service</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Env Var</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Value</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.envVar} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-white font-medium">{k.name}</td>
                <td className="px-4 py-3 text-white/50 font-mono text-xs">{k.envVar}</td>
                <td className="px-4 py-3 text-white/40 font-mono text-xs">{k.masked}</td>
                <td className="px-4 py-3">
                  {k.configured ? (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 size={14} /> Configured
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <XCircle size={14} /> Missing
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRotate(k.envVar)}
                    disabled={rotating === k.envVar}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                  >
                    {rotating === k.envVar ? 'Saving…' : 'Rotate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/30">
        Rotation writes to the .env.prod file on the server (ENV_FILE_PATH). Restart containers after rotation to apply changes.
      </p>
    </div>
  )
}
