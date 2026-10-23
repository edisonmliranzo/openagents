'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plug, Plus, RefreshCw, Server, Trash2, Wifi, Wrench, X, Zap } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { McpServerView } from '@openagents/sdk'

const STATUS_STYLE: Record<string, string> = {
  connected: 'bg-emerald-500/15 text-emerald-300',
  connecting: 'bg-blue-500/15 text-blue-300',
  error: 'bg-red-500/15 text-red-300',
  idle: 'bg-slate-500/15 text-slate-300',
  removed: 'bg-slate-500/15 text-slate-300',
}

export default function McpServersPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [servers, setServers] = useState<McpServerView[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      setServers(await sdk.mcp.list())
    } catch (error: any) {
      addToast('error', error?.message ?? 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  // Live status stream: reflects connect/error events the instant they happen.
  useEffect(() => {
    const controller = new AbortController()
    void sdk.client
      .streamGet(
        '/api/v1/mcp/servers/stream',
        (chunk) => {
          try {
            const parsed = JSON.parse(chunk)
            if (parsed.event === 'mcp_status') void load()
          } catch {
            // ignore malformed frames
          }
        },
        undefined,
        controller.signal,
      )
      .catch(() => {
        /* stream closed */
      })
    return () => controller.abort()
  }, [load])

  async function connect(id: string) {
    setBusyId(id)
    try {
      const result = await sdk.mcp.connect(id)
      if (result.ok) addToast('success', `Connected — ${result.toolCount ?? 0} tool(s) discovered`)
      else addToast('error', result.error ?? 'Connection failed')
      await load()
    } catch (error: any) {
      addToast('error', error?.message ?? 'Connect failed')
    } finally {
      setBusyId(null)
    }
  }

  async function test(id: string) {
    setBusyId(id)
    try {
      const result = await sdk.mcp.test(id)
      addToast('success', `Test OK — ${result.toolCount ?? 0} tool(s)`)
    } catch (error: any) {
      addToast('error', error?.message ?? 'Test failed')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleEnabled(server: McpServerView) {
    try {
      await sdk.mcp.update(server.id, { enabled: !server.enabled })
      await load()
    } catch (error: any) {
      addToast('error', error?.message ?? 'Update failed')
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this MCP server?')) return
    try {
      await sdk.mcp.remove(id)
      await load()
    } catch (error: any) {
      addToast('error', error?.message ?? 'Delete failed')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-semibold">MCP Servers</h1>
            <p className="text-sm text-muted-foreground">
              Connect your own Model Context Protocol servers. Tools appear live, scoped to you.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            <Plus className="h-4 w-4" /> Add server
          </button>
        </div>
      </header>

      {showForm && <McpForm onCreated={() => { setShowForm(false); void load() }} />}

      <section className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && servers.length === 0 && (
          <p className="text-sm text-muted-foreground">No MCP servers yet. Add one to get started.</p>
        )}
        {servers.map((server) => (
          <div key={server.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-indigo-300" />
                <span className="font-medium">{server.name}</span>
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] uppercase">{server.transport}</code>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[server.lastStatus] ?? STATUS_STYLE.idle}`}>
                  {server.lastStatus}
                </span>
                {server.toolCount > 0 && (
                  <span className="text-xs text-muted-foreground">{server.toolCount} tools</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void toggleEnabled(server)}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                  title={server.enabled ? 'Disable' : 'Enable'}
                >
                  {server.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => void test(server.id)}
                  disabled={busyId === server.id}
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                  title="Test connection"
                >
                  <Wifi className="h-3.5 w-3.5" /> Test
                </button>
                <button
                  onClick={() => void connect(server.id)}
                  disabled={busyId === server.id}
                  className="flex items-center gap-1 rounded-lg border border-indigo-400/40 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
                  title="Connect and discover tools"
                >
                  <Zap className="h-3.5 w-3.5" /> {busyId === server.id ? 'Working…' : 'Connect'}
                </button>
                <button
                  onClick={() => void remove(server.id)}
                  className="rounded-lg border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {server.command && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {server.command} {server.args.join(' ')}
              </p>
            )}
            {server.url && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{server.url}</p>}
            {server.lastError && (
              <p className="mt-1 text-xs text-red-300">{server.lastError}</p>
            )}
            {(server.envKeys.length > 0 || server.headerNames.length > 0) && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {server.envKeys.length > 0 && <>env: {server.envKeys.join(', ')} · </>}
                {server.headerNames.length > 0 && <>headers: {server.headerNames.join(', ')}</>}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}

function McpForm({ onCreated }: { onCreated: () => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [form, setForm] = useState({
    name: '',
    transport: 'stdio' as 'stdio' | 'http',
    command: '',
    args: '',
    url: '',
    envJson: '',
    headersJson: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await sdk.mcp.create({
        name: form.name.trim(),
        transport: form.transport,
        ...(form.transport === 'http'
          ? { url: form.url.trim(), headers: parseJsonMap(form.headersJson) }
          : { command: form.command.trim(), args: form.args.trim() ? form.args.trim().split(/\s+/) : [] }),
        ...(form.envJson.trim() ? { secretEnv: parseJsonMap(form.envJson) } : {}),
      })
      onCreated()
    } catch (error: any) {
      addToast('error', error?.message ?? 'Failed to create server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">New MCP server</h2>
        <button onClick={onCreated} className="text-muted-foreground hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
        className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        {(['stdio', 'http'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setForm({ ...form, transport: t })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${form.transport === t ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 hover:bg-white/5'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {form.transport === 'http' ? (
        <>
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://example.com/mcp"
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
          />
          <textarea
            value={form.headersJson}
            onChange={(e) => setForm({ ...form, headersJson: e.target.value })}
            placeholder='{"Authorization": "Bearer …"}  (values are encrypted)'
            rows={2}
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
          />
        </>
      ) : (
        <>
          <input
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="npx"
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
          />
          <input
            value={form.args}
            onChange={(e) => setForm({ ...form, args: e.target.value })}
            placeholder="-y @modelcontextprotocol/server-filesystem ./data"
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
          />
        </>
      )}
      {form.transport === 'stdio' && (
        <textarea
          value={form.envJson}
          onChange={(e) => setForm({ ...form, envJson: e.target.value })}
          placeholder='{"API_KEY": "value"}  (values are encrypted)'
          rows={2}
          className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
        />
      )}
      <div className="flex justify-end">
        <button
          onClick={() => void submit()}
          disabled={saving || !form.name.trim()}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          <Wrench className="h-4 w-4" /> {saving ? 'Saving…' : 'Add server'}
        </button>
      </div>
    </div>
  )
}

function parseJsonMap(raw: string): Record<string, string> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}
