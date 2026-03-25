'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { ConnectorConnection, ConnectorHealthEntry, ConnectorStatus } from '@openagents/shared'

interface ConnectorCatalogEntry {
  id: string
  label: string
  description: string
  category: string
  docsUrl: string
  envVars: string[]
  tools: string[]
  icon: string
}

const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    id: 'google_gmail',
    label: 'Gmail',
    category: 'Productivity',
    description: 'Search mail, read threads, inspect labels, draft replies, and send drafts with the Gmail API.',
    docsUrl: 'https://developers.google.com/gmail/api',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    tools: ['gmail_search', 'gmail_read_thread', 'gmail_list_labels', 'gmail_draft_reply', 'gmail_send_draft'],
    icon: '📧',
  },
  {
    id: 'google_calendar',
    label: 'Google Calendar',
    category: 'Productivity',
    description: 'Check availability plus create, update, and cancel calendar events.',
    docsUrl: 'https://developers.google.com/calendar',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    tools: ['calendar_get_availability', 'calendar_create_event', 'calendar_update_event', 'calendar_cancel_event'],
    icon: '📅',
  },
  {
    id: 'github',
    label: 'GitHub',
    category: 'Engineering',
    description: 'Create issues, list PRs, add comments, and read files.',
    docsUrl: 'https://docs.github.com/en/rest',
    envVars: ['GITHUB_TOKEN'],
    tools: ['github_create_issue', 'github_list_prs', 'github_add_comment', 'github_get_file', 'github_create_pr'],
    icon: '🐙',
  },
  {
    id: 'linear',
    label: 'Linear',
    category: 'Engineering',
    description: 'Manage issues, update status, and post comments in Linear.',
    docsUrl: 'https://developers.linear.app/docs',
    envVars: ['LINEAR_API_KEY'],
    tools: ['linear_create_issue', 'linear_update_status', 'linear_list_issues', 'linear_add_comment'],
    icon: '⬡',
  },
  {
    id: 'jira',
    label: 'Jira',
    category: 'Engineering',
    description: 'Create and transition Jira issues, add comments, and search via JQL.',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
    envVars: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    tools: ['jira_create_issue', 'jira_transition_issue', 'jira_search_issues', 'jira_add_comment', 'jira_list_transitions'],
    icon: '🔷',
  },
  {
    id: 'notion',
    label: 'Notion',
    category: 'Knowledge',
    description: 'Read pages, create documents, and query Notion databases.',
    docsUrl: 'https://developers.notion.com',
    envVars: ['NOTION_TOKEN'],
    tools: ['notion_read_page', 'notion_create_page', 'notion_query_database'],
    icon: '📝',
  },
  {
    id: 'bybit',
    label: 'Bybit',
    category: 'Finance',
    description: 'Read trading positions, wallet balances, and place demo orders.',
    docsUrl: 'https://bybit-exchange.github.io/docs/',
    envVars: ['BYBIT_API_KEY', 'BYBIT_API_SECRET'],
    tools: ['bybit_get_ticker', 'bybit_get_positions', 'bybit_get_wallet_balance', 'bybit_place_demo_order'],
    icon: '📈',
  },
  {
    id: 'web',
    label: 'Web Tools',
    category: 'Research',
    description: 'Search the web and fetch page content. No credentials required.',
    docsUrl: '',
    envVars: [],
    tools: ['web_fetch', 'web_search'],
    icon: '🌐',
  },
  {
    id: 'deep_research',
    label: 'Deep Research',
    category: 'Research',
    description: 'Multi-step web research with source synthesis.',
    docsUrl: '',
    envVars: [],
    tools: ['deep_research'],
    icon: '🔬',
  },
]

const CATEGORIES = [...new Set(CONNECTOR_CATALOG.map((c) => c.category))]

export default function ConnectorsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [tools, setTools] = useState<Array<{ name: string }>>([])
  const [health, setHealth] = useState<ConnectorHealthEntry[]>([])
  const [connections, setConnections] = useState<ConnectorConnection[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [toolList, healthData, connList] = await Promise.all([
        sdk.tools.list().catch(() => []),
        sdk.connectors.health().catch(() => ({ connectors: [] as ConnectorHealthEntry[] })),
        sdk.connectors.list().catch(() => [] as ConnectorConnection[]),
      ])
      setTools(toolList as Array<{ name: string }>)
      setHealth(healthData.connectors ?? [])
      setConnections(connList)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const installedToolNames = new Set(tools.map((t) => t.name))

  const filtered = CONNECTOR_CATALOG.filter((entry) => {
    const matchesCategory = selectedCategory === 'All' || entry.category === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      !q ||
      entry.label.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.tools.some((t) => t.includes(q))
    return matchesCategory && matchesSearch
  })

  function getConnectorStatus(entry: ConnectorCatalogEntry) {
    const healthEntry = health.find((h) => h.connectorId === entry.id)
    if (healthEntry) return healthEntry.status
    const toolsAvailable = entry.tools.every((t) => installedToolNames.has(t))
    if (toolsAvailable && entry.envVars.length === 0) return 'connected'
    return 'unknown'
  }

  const STATUS_BADGE: Record<ConnectorStatus, string> = {
    connected: 'bg-emerald-100 text-emerald-700',
    degraded: 'bg-amber-100 text-amber-700',
    down: 'bg-red-100 text-red-700',
  }
  const STATUS_LABEL: Record<ConnectorStatus, string> = {
    connected: 'Connected',
    degraded: 'Degraded',
    down: 'Down',
  }
  function statusBadge(status: string) { return STATUS_BADGE[status as ConnectorStatus] ?? 'bg-slate-100 text-slate-500' }
  function statusLabel(status: string) { return STATUS_LABEL[status as ConnectorStatus] ?? 'Not configured' }

  async function handleTestConnection(connectorId: string) {
    try {
      await load()
      addToast('success', `Health check triggered for ${connectorId}`)
    } catch {
      addToast('error', 'Health check failed')
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Connector Catalog</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Browse and configure service integrations. Set environment variables in your API server to activate each connector.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing…' : 'Refresh Status'}
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search connectors…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 w-56"
        />
        <div className="flex flex-wrap gap-2">
          {['All', ...CATEGORIES].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                selectedCategory === category
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['connected', 'degraded', 'down', 'unknown'].map((status) => {
          const count = CONNECTOR_CATALOG.filter((e) => getConnectorStatus(e) === status).length
          return (
            <div key={status} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(status)}`}>
                {statusLabel(status)}
              </p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Connector cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((entry) => {
          const status = getConnectorStatus(entry)
          const isExpanded = expandedId === entry.id
          const availableTools = entry.tools.filter((t) => installedToolNames.has(t))
          const connection = connections.find((item) => item.connectorId === entry.id) ?? null

          return (
            <article
              key={entry.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{entry.icon}</span>
                    <div>
                      <h3 className="font-semibold text-slate-900">{entry.label}</h3>
                      <span className="text-[11px] text-slate-400">{entry.category}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(status)}`}>
                    {statusLabel(status)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{entry.description}</p>

                <div className="mt-3 flex flex-wrap gap-1">
                  {entry.tools.map((toolName) => (
                    <span
                      key={toolName}
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                        installedToolNames.has(toolName)
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {toolName}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {availableTools.length}/{entry.tools.length} tools active
                </span>
                <div className="flex gap-2">
                  {entry.docsUrl && (
                    <a
                      href={entry.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded text-xs text-rose-600 hover:underline font-medium"
                    >
                      Docs ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="rounded text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    {isExpanded ? 'Hide setup' : 'Setup'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTestConnection(entry.id)}
                    className="rounded text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Test
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                  {connection?.diagnostics && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Scope Coverage
                          </p>
                          <p className="text-xs text-slate-600">{connection.diagnostics.summary}</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {connection.diagnostics.availableTools.length}/{connection.diagnostics.toolAccess.length} ready
                        </span>
                      </div>
                      {connection.diagnostics.missingScopes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {connection.diagnostics.missingScopes.map((scope) => (
                            <span key={scope} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-700">
                              {scope}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {entry.envVars.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        Required Environment Variables
                      </p>
                      <div className="space-y-1.5">
                        {entry.envVars.map((envVar) => (
                          <div key={envVar} className="flex items-center gap-2">
                            <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                              {envVar}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Set these in <code className="text-slate-600">apps/api/.env</code> and restart the API server.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-700 font-medium">
                      No credentials required — connector is available by default.
                    </p>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-12">
          No connectors match your search.
        </p>
      )}
    </div>
  )
}
