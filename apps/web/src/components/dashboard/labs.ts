'use client'

import { useCallback, useEffect, useState } from 'react'

export const LABS_STORAGE_KEY = 'openagents.labs'
const LABS_EVENT = 'openagents:labs-changed'

export interface LabsLink {
  label: string
  href: string
}

/** Experimental modules, hidden unless "Labs (experimental)" is enabled. */
export const LABS_LINKS: LabsLink[] = [
  { label: 'Frontier Hub', href: '/frontier' },
  { label: 'Agent Marketplace', href: '/frontier/agent-marketplace' },
  { label: 'Smart Router', href: '/frontier/smart-router' },
  { label: 'Durable Agents', href: '/frontier/durable-agents' },
  { label: 'Evals', href: '/frontier/evals' },
  { label: 'Voice Console', href: '/frontier/voice-console' },
  { label: 'Trust Center', href: '/frontier/trust-center' },
  { label: 'Injection Firewall', href: '/frontier/injection-firewall' },
  { label: 'Replay & Rewind', href: '/frontier/replay-rewind' },
  { label: 'Sandbox Exec', href: '/frontier/sandbox-exec' },
  { label: 'Swarm Market', href: '/swarm/market' },
  { label: 'Swarm Verifier', href: '/swarm/verifier' },
  { label: 'Agent Labs', href: '/agent/labs' },
  { label: 'Agent Evolution', href: '/agent/evolution' },
  { label: 'Tool Forge', href: '/agent/tool-forge' },
  { label: 'Tree of Actions', href: '/agent/tree-of-actions' },
  { label: 'Speculative Exec', href: '/agent/speculative' },
  { label: 'Security Chaos', href: '/security/chaos' },
  { label: 'Security Firewall', href: '/security/firewall' },
  { label: 'Security Ledger', href: '/security/ledger' },
  { label: 'Memory & Mind', href: '/memory' },
  { label: 'MCP Servers', href: '/mcp' },
  { label: 'War Room', href: '/war-room' },
  { label: 'Digital Twin', href: '/digital-twin' },
  { label: 'Time Machine', href: '/time-machine' },
  { label: 'Workflows', href: '/workflows' },
  { label: 'Usage & Costs', href: '/costs' },
  { label: 'Docs', href: '/docs' },
]

export function useLabsEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const read = () => {
      try {
        setEnabled(window.localStorage.getItem(LABS_STORAGE_KEY) === '1')
      } catch {
        /* ignore */
      }
    }
    read()
    window.addEventListener(LABS_EVENT, read)
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener(LABS_EVENT, read)
      window.removeEventListener('storage', read)
    }
  }, [])
  const update = useCallback((next: boolean) => {
    setEnabled(next)
    try {
      window.localStorage.setItem(LABS_STORAGE_KEY, next ? '1' : '0')
      window.dispatchEvent(new Event(LABS_EVENT))
    } catch {
      /* ignore */
    }
  }, [])
  return [enabled, update]
}
