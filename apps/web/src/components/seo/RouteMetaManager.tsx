'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface RouteMeta {
  title: string
  description: string
}

const ROUTE_META_MAP: Record<string, RouteMeta> = {
  '/': {
    title: 'OpenAgents — Autonomous AI Agent Workspace, Voice & Avatar Calls, APIsRouter (93+ Frontier Models)',
    description:
      'Deploy personal AI agents with real-time Voice Calls, Animated 3D Avatars, and 93+ frontier models via APIsRouter (Claude 5.5, GPT-6.1, Gemini 4, DeepSeek V4.1, Kimi K3.1, Grok 4.7) or Bring Your Own Key (BYOK).',
  },
  '/login': {
    title: 'Sign In | OpenAgents — Autonomous AI Agent Platform',
    description:
      'Sign in to your OpenAgents workspace to manage autonomous AI agents, live voice & avatar calls, APIsRouter keys, and multi-channel workflows.',
  },
  '/register': {
    title: 'Create Free Account | OpenAgents — Autonomous AI Agent Workspace',
    description:
      'Create your free OpenAgents account in seconds. Connect your APIsRouter unified API key or Bring Your Own Key (BYOK) and launch autonomous AI agents.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | OpenAgents — Zero-Markup BYOK & Encrypted AI Workspace',
    description:
      'Read the official OpenAgents Privacy Policy. Learn how we protect your encrypted API keys (APIsRouter & BYOK), voice call transcripts, agent memory, and personal data.',
  },
  '/privacy': {
    title: 'Privacy & Data Controls | OpenAgents Security Center',
    description:
      'Configure workspace encryption, zero-retention LLM logging, API key vault security, and GDPR/CCPA data controls in OpenAgents.',
  },
  '/terms': {
    title: 'Terms of Service | OpenAgents Platform',
    description:
      'Read the OpenAgents Terms of Service covering autonomous agent execution, human-in-the-loop approvals, APIsRouter & BYOK usage, and platform governance.',
  },
  '/support': {
    title: 'Support & Help Center | OpenAgents',
    description:
      'Get technical support, documentation guides, APIsRouter setup help, and troubleshooting for your OpenAgents workspace.',
  },
  '/docs': {
    title: 'Documentation & Quickstart Guide | OpenAgents',
    description:
      'Complete developer documentation for OpenAgents: APIsRouter setup, BYOK configuration, voice & avatar calls, MCP tools, workflows, and SDK integration.',
  },
  '/compare': {
    title: 'Compare AI Agent Platforms & Frontier Models | OpenAgents',
    description:
      'Compare OpenAgents with OpenRouter, AutoGPT, CrewAI, and LangGraph across 93+ live 2026 frontier models, voice/avatar latency, and BYOK cost.',
  },
  '/chat': {
    title: 'Live Agent Chat & Multimodal Studio | OpenAgents',
    description:
      'Chat with your autonomous AI agent powered by Claude Sonnet 5.5, GPT-6.1 Sol Pro, Gemini 4 Argon, DeepSeek V4.1, and Grok 4.7 with live voice & expressive avatar mode.',
  },
  '/opencode': {
    title: 'OpenCode TUI Studio & APIsRouter CLI Generator — Build vs Plan Agents | OpenAgents',
    description:
      'Interactive Terminal UI (TUI) Coding Agent Studio with Tab-switchable Build & Plan agents, @general subagent, /init AGENTS.md generator, /undo Git snapshots, and 1-click opencode.json config pre-wired to APIsRouter.dev (93+ models).',
  },
  '/phone': {
    title: 'Live Voice Calls & Expressive 3D Avatars | OpenAgents',
    description:
      'Talk naturally with your AI agent via full-duplex WebRTC voice calls, lip-synced expressive avatars, and outbound/inbound AI phone automation.',
  },
  '/settings/config': {
    title: 'LLM Provider & APIsRouter / BYOK Configuration | OpenAgents',
    description:
      'Connect your unified APIsRouter.dev API key (93+ frontier models) or Bring Your Own Key (OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Ollama).',
  },
  '/settings/get-started': {
    title: 'Quickstart Onboarding & API Key Setup | OpenAgents',
    description:
      'Set up your OpenAgents workspace in 3 steps: connect APIsRouter or BYOK, configure voice & avatar preferences, and launch your first autonomous agent.',
  },
  '/marketplace': {
    title: 'Agent Skills, Templates & Prompt Marketplace | OpenAgents',
    description:
      'Browse and install verified AI agent templates, MCP connectors, multi-step workflows, and custom skills from the OpenAgents Marketplace.',
  },
  '/billing': {
    title: 'Billing, Token Usage & APIsRouter Credits | OpenAgents',
    description:
      'Monitor real-time token expenditure across 93+ frontier models, manage APIsRouter credits, and configure cost guardrails.',
  },
  '/workflows': {
    title: 'Visual Workflow Builder & DAG Automation | OpenAgents',
    description:
      'Design, schedule, and run multi-step autonomous agent workflows with conditional branching, webhooks, and human approval gates.',
  },
  '/approvals': {
    title: 'Human-in-the-Loop Approval Queue | OpenAgents Governance',
    description:
      'Review, approve, or reject high-impact agent tool executions before they run in production.',
  },
  '/memory': {
    title: 'Long-Term Vector Memory & Knowledge Base | OpenAgents',
    description:
      'Inspect and curate persistent semantic facts, episodic agent memory, and RAG document collections.',
  },
  '/analytics': {
    title: 'Agent Telemetry, Latency & Cost Analytics | OpenAgents',
    description:
      'Real-time observability dashboard tracking LLM latency, token cost per model, tool success rates, and user engagement.',
  },
}

function humanizePathname(pathname: string): RouteMeta {
  if (ROUTE_META_MAP[pathname]) {
    return ROUTE_META_MAP[pathname]
  }

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    )

  const pageLabel = segments.length > 0 ? segments.join(' · ') : 'Autonomous AI Agent Platform'
  return {
    title: `${pageLabel} | OpenAgents`,
    description: `Explore ${pageLabel} in OpenAgents — the autonomous AI agent platform with live Voice & Avatar calls, 93+ frontier models via APIsRouter.dev, and full BYOK support.`,
  }
}

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  if (typeof document === 'undefined') return
  let element = document.head.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attrName, attrValue)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export function RouteMetaManager() {
  const pathname = usePathname() || '/'

  useEffect(() => {
    const meta = humanizePathname(pathname)
    document.title = meta.title

    upsertMetaTag('name', 'description', meta.description)
    upsertMetaTag('property', 'og:title', meta.title)
    upsertMetaTag('property', 'og:description', meta.description)
    upsertMetaTag('property', 'og:url', `${window.location.origin}${pathname}`)
    upsertMetaTag('name', 'twitter:title', meta.title)
    upsertMetaTag('name', 'twitter:description', meta.description)
  }, [pathname])

  return null
}
