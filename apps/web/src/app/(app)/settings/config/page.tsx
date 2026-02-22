'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import {
  KeyRound,
  Cpu,
  Globe2,
  Sparkles,
  Link2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import type { LlmApiKey, UserDomain, UserDomainProvider, UserDomainStatus } from '@openagents/shared'
import { LLM_MODEL_OPTIONS } from '@openagents/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'minimax'

const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google', 'minimax', 'ollama']

interface ProviderCardState {
  apiKey: string
  baseUrl: string
  showKey: boolean
  testStatus: 'idle' | 'testing' | 'ok' | 'error'
  testModel: string
  testError: string
  isSaving: boolean
}

const DEFAULTS: Record<Provider, ProviderCardState> = {
  anthropic: { apiKey: '', baseUrl: '', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  openai:    { apiKey: '', baseUrl: '', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  google:    { apiKey: '', baseUrl: '', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  minimax:   { apiKey: '', baseUrl: '', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  ollama:    { apiKey: '', baseUrl: 'http://localhost:11434', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
}
const OLLAMA_FALLBACK_MODELS: string[] = [...(LLM_MODEL_OPTIONS.ollama as unknown as string[])]

const PROVIDER_META: Record<Provider, {
  label: string
  icon: React.ReactNode
  gradient: string
  ring: string
  inputLabel: string
  isKeyless: boolean
}> = {
  anthropic: {
    label: 'Anthropic',
    icon: <KeyRound className="h-5 w-5" />,
    gradient: 'from-rose-500 to-orange-500',
    ring: 'ring-rose-400',
    inputLabel: 'API Key',
    isKeyless: false,
  },
  openai: {
    label: 'OpenAI',
    icon: <Cpu className="h-5 w-5" />,
    gradient: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-400',
    inputLabel: 'API Key',
    isKeyless: false,
  },
  google: {
    label: 'Google Gemini',
    icon: <Sparkles className="h-5 w-5" />,
    gradient: 'from-blue-500 to-indigo-600',
    ring: 'ring-blue-400',
    inputLabel: 'API Key',
    isKeyless: false,
  },
  minimax: {
    label: 'MiniMax',
    icon: <Sparkles className="h-5 w-5" />,
    gradient: 'from-fuchsia-500 to-purple-600',
    ring: 'ring-fuchsia-400',
    inputLabel: 'API Key',
    isKeyless: false,
  },
  ollama: {
    label: 'Ollama',
    icon: <Globe2 className="h-5 w-5" />,
    gradient: 'from-indigo-500 to-violet-600',
    ring: 'ring-indigo-400',
    inputLabel: 'Server URL',
    isKeyless: true,
  },
}

const DOMAIN_PROVIDERS: UserDomainProvider[] = ['manual', 'cloudflare', 'caddy', 'nginx']
const DOMAIN_STATUSES: UserDomainStatus[] = ['pending', 'active', 'error']
const DOMAIN_PROVIDER_LABELS: Record<UserDomainProvider, string> = {
  manual: 'Manual',
  cloudflare: 'Cloudflare',
  caddy: 'Caddy',
  nginx: 'Nginx',
}
const DOMAIN_STATUS_LABELS: Record<UserDomainStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  error: 'Error',
}
const DEFAULT_DOMAIN_TARGET_HOST = '<server-ip>:3000'

interface DomainDraft {
  provider: UserDomainProvider
  status: UserDomainStatus
  targetHost: string
  proxyInstructions: string
}

function isDomainProvider(value: string): value is UserDomainProvider {
  return DOMAIN_PROVIDERS.includes(value as UserDomainProvider)
}

function isDomainStatus(value: string): value is UserDomainStatus {
  return DOMAIN_STATUSES.includes(value as UserDomainStatus)
}

function toDomainDraft(domain: Pick<UserDomain, 'provider' | 'status' | 'targetHost' | 'proxyInstructions'>): DomainDraft {
  return {
    provider: isDomainProvider(domain.provider) ? domain.provider : 'manual',
    status: isDomainStatus(domain.status) ? domain.status : 'pending',
    targetHost: domain.targetHost ?? '',
    proxyInstructions: domain.proxyInstructions ?? '',
  }
}

function normalizeTargetHost(value?: string | null) {
  const raw = (value ?? '').trim()
  if (!raw) return DEFAULT_DOMAIN_TARGET_HOST
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function domainSetupSnippet(domain: string, provider: UserDomainProvider, targetHost?: string | null) {
  const upstream = normalizeTargetHost(targetHost)

  if (provider === 'cloudflare') {
    return [
      `Cloudflare DNS + Proxy for ${domain}`,
      `1) DNS record: A @ -> <your-server-public-ip>`,
      `2) Optional: CNAME www -> @`,
      `3) Turn Proxy status ON (orange cloud)`,
      `4) SSL/TLS mode: Full (strict)`,
      `5) Origin service target: ${upstream}`,
    ].join('\n')
  }

  if (provider === 'caddy') {
    return [
      `${domain} {`,
      `  reverse_proxy ${upstream}`,
      `  encode gzip`,
      `}`,
    ].join('\n')
  }

  if (provider === 'nginx') {
    return [
      'server {',
      '  listen 80;',
      `  server_name ${domain} www.${domain};`,
      '  location / {',
      `    proxy_pass http://${upstream};`,
      '    proxy_set_header Host $host;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $scheme;',
      '  }',
      '}',
    ].join('\n')
  }

  return [
    `Manual setup for ${domain}`,
    `1) DNS record: A @ -> <your-server-public-ip>`,
    `2) Open inbound ports 80 and 443 on your server/firewall`,
    `3) Reverse proxy ${domain} -> ${upstream}`,
    `4) Enable TLS certificate (Let's Encrypt recommended)`,
  ].join('\n')
}

function isProvider(value: string): value is Provider {
  return PROVIDERS.includes(value as Provider)
}

function providerModels(provider: Provider): string[] {
  return (LLM_MODEL_OPTIONS[provider] as unknown as string[]) ?? []
}

function sanitizeOllamaModels(models: string[]) {
  const unique = Array.from(new Set(models.map((m) => m.trim()).filter(Boolean)))
  const local = unique.filter((model) => {
    const normalized = model.toLowerCase()
    return !normalized.includes(':cloud') && !normalized.includes('/cloud') && !normalized.endsWith('-cloud')
  })
  const cloud = unique.filter((model) => {
    const normalized = model.toLowerCase()
    return normalized.includes(':cloud') || normalized.includes('/cloud') || normalized.endsWith('-cloud')
  })
  return [...local, ...cloud]
}

function resolveOllamaModel(inputModel: string, availableModels: string[]) {
  const requested = inputModel.trim()
  if (!requested) return availableModels[0] ?? ''

  const lowerRequested = requested.toLowerCase()
  const cloudAlias = availableModels.find((m) => m.toLowerCase() === `${lowerRequested}:cloud`)
  if (cloudAlias) return cloudAlias

  const exact = availableModels.find((m) => m.toLowerCase() === lowerRequested)
  if (exact) return exact

  const prefix = availableModels.find((m) => m.toLowerCase().startsWith(lowerRequested))
  if (prefix) return prefix

  const includes = availableModels.find((m) => m.toLowerCase().includes(lowerRequested))
  if (includes) return includes

  return ''
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [profileEmail, setProfileEmail] = useState('')
  const [activeProvider, setActiveProvider] = useState<Provider>('anthropic')
  const [activeModel, setActiveModel] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [cards, setCards] = useState<Record<Provider, ProviderCardState>>({ ...DEFAULTS })
  const [existingKeys, setExistingKeys] = useState<LlmApiKey[]>([])
  const [domains, setDomains] = useState<UserDomain[]>([])
  const [domainDrafts, setDomainDrafts] = useState<Record<string, DomainDraft>>({})
  const [newDomain, setNewDomain] = useState('')
  const [newDomainProvider, setNewDomainProvider] = useState<UserDomainProvider>('manual')
  const [newDomainStatus, setNewDomainStatus] = useState<UserDomainStatus>('pending')
  const [newDomainTargetHost, setNewDomainTargetHost] = useState('')
  const [newDomainInstructions, setNewDomainInstructions] = useState('')
  const [isSavingDomain, setIsSavingDomain] = useState(false)
  const [updatingDomainId, setUpdatingDomainId] = useState<string | null>(null)
  const [deletingDomainId, setDeletingDomainId] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isSavingActive, setIsSavingActive] = useState(false)
  const [savedActiveLabel, setSavedActiveLabel] = useState('')
  const [isSwitchingLocal, setIsSwitchingLocal] = useState(false)
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelsStatus, setOllamaModelsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [ollamaModelsError, setOllamaModelsError] = useState('')

  const modelOptions: string[] = (() => {
    if (activeProvider !== 'ollama') return providerModels(activeProvider)

    if (ollamaModels.length > 0) {
      // Installed models first, then append any fallback entries not already present
      const merged = [...ollamaModels]
      for (const m of OLLAMA_FALLBACK_MODELS) {
        if (!merged.includes(m)) merged.push(m)
      }
      return merged
    }
    return OLLAMA_FALLBACK_MODELS
  })()

  const loadOllamaModels = useCallback(async (baseUrl?: string) => {
    setOllamaModelsStatus('loading')
    setOllamaModelsError('')
    try {
      const result = await sdk.agent.listOllamaModels(baseUrl || undefined)
      setOllamaModels(sanitizeOllamaModels(result.models ?? []))
      setOllamaModelsStatus('loaded')
    } catch (err: any) {
      setOllamaModels([])
      setOllamaModelsStatus('error')
      setOllamaModelsError(err?.message ?? 'Failed to load Ollama models')
    }
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    setStatus('')
    try {
      const [profile, settings, keys, domainList] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.users.getLlmKeys(),
        sdk.users.listDomains(),
      ])
      const preferredProvider = isProvider(settings.preferredProvider)
        ? settings.preferredProvider
        : 'anthropic'
      setProfileEmail(profile.email ?? '')
      setActiveProvider(preferredProvider)
      setActiveModel(settings.preferredModel ?? '')
      setCustomSystemPrompt(settings.customSystemPrompt ?? '')
      setExistingKeys(keys)
      setDomains(domainList)
      setDomainDrafts(
        Object.fromEntries(
          domainList.map((domain) => [domain.id, toDomainDraft(domain)]),
        ),
      )

      // Pre-fill baseUrl for ollama if stored
      const ollamaKey = keys.find((k) => k.provider === 'ollama')
      const ollamaBaseUrl = ollamaKey?.baseUrl ?? DEFAULTS.ollama.baseUrl
      setCards((prev) => ({
        ...prev,
        ollama: { ...prev.ollama, baseUrl: ollamaBaseUrl },
      }))

      if (preferredProvider === 'ollama') {
        await loadOllamaModels(ollamaBaseUrl)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load config')
    } finally {
      setIsLoading(false)
    }
  }, [loadOllamaModels])

  useEffect(() => { void load() }, [load])

  // Keep selected model aligned with the available options for cloud providers.
  // For Ollama, preserve saved model values even if model discovery is temporarily unavailable.
  useEffect(() => {
    if (!activeModel && modelOptions.length > 0) {
      setActiveModel(modelOptions[0] ?? '')
      return
    }

    if (activeProvider !== 'ollama' && modelOptions.length > 0 && !modelOptions.includes(activeModel)) {
      setActiveModel(modelOptions[0] ?? '')
    }
  }, [activeModel, activeProvider, modelOptions])

  // On first switch to Ollama, fetch locally available models.
  useEffect(() => {
    if (activeProvider !== 'ollama') return
    if (ollamaModelsStatus !== 'idle') return
    void loadOllamaModels(cards.ollama.baseUrl || undefined)
  }, [activeProvider, cards.ollama.baseUrl, loadOllamaModels, ollamaModelsStatus])

  // If an invalid model id was carried over while Ollama is active, normalize to an available model.
  useEffect(() => {
    if (activeProvider !== 'ollama') return
    if (modelOptions.length === 0) return

    const normalized = resolveOllamaModel(activeModel, modelOptions)
    if (normalized !== activeModel) {
      setActiveModel(normalized)
    }
  }, [activeModel, activeProvider, modelOptions])

  async function handleSaveActive() {
    setIsSavingActive(true)
    setError('')
    setStatus('')
    try {
      let preferredModelToSave = activeModel
      if (activeProvider === 'ollama') {
        const baseUrl = cards.ollama.baseUrl.trim() || DEFAULTS.ollama.baseUrl
        preferredModelToSave = resolveOllamaModel(activeModel, modelOptions)
        if (!preferredModelToSave) {
          setError('Select a local Ollama model first. Run "ollama pull <model>" then Refresh models.')
          return
        }
        if (preferredModelToSave !== activeModel) {
          setActiveModel(preferredModelToSave)
        }
        await sdk.users.upsertLlmKey('ollama', { baseUrl, isActive: true })
      }
      await sdk.users.updateSettings({
        preferredProvider: activeProvider,
        preferredModel: preferredModelToSave,
        customSystemPrompt: customSystemPrompt.trim() || null,
      })
      const label = `${PROVIDER_META[activeProvider].label} · ${preferredModelToSave}`
      setStatus(`Saved: ${label}`)
      setSavedActiveLabel(label)
      setTimeout(() => setSavedActiveLabel(''), 3000)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save')
    } finally {
      setIsSavingActive(false)
    }
  }

  async function switchLocalAndSave(enableLocal: boolean) {
    setIsSwitchingLocal(true)
    setError('')
    setStatus('')

    try {
      if (enableLocal) {
        let resolvedModels = ollamaModels
        let modelLookupFailed = false
        if (resolvedModels.length === 0) {
          try {
            const result = await sdk.agent.listOllamaModels(cards.ollama.baseUrl || undefined)
            resolvedModels = sanitizeOllamaModels(result.models ?? [])
            setOllamaModels(resolvedModels)
            setOllamaModelsStatus('loaded')
            setOllamaModelsError('')
          } catch (lookupErr: any) {
            modelLookupFailed = true
            setOllamaModels([])
            setOllamaModelsStatus('error')
            setOllamaModelsError(lookupErr?.message ?? 'Failed to load Ollama models')
          }
        }

        const options = resolvedModels.length > 0 ? resolvedModels : OLLAMA_FALLBACK_MODELS
        const nextModel = resolveOllamaModel(activeModel, options)
        if (!nextModel) {
          setError('No local Ollama models found. Run "ollama pull <model>" then click Refresh models.')
          return
        }
        const baseUrl = cards.ollama.baseUrl.trim() || DEFAULTS.ollama.baseUrl

        await sdk.users.upsertLlmKey('ollama', { baseUrl, isActive: true })
        setActiveProvider('ollama')
        setActiveModel(nextModel)
        await sdk.users.updateSettings({
          preferredProvider: 'ollama',
          preferredModel: nextModel,
          customSystemPrompt: customSystemPrompt.trim() || null,
        })
        const keys = await sdk.users.getLlmKeys()
        setExistingKeys(keys)
        setStatus(
          modelLookupFailed
            ? `Local LLM enabled (${nextModel}). Model auto-discovery failed; click "Refresh models" when Ollama is running.`
            : `Local LLM enabled (${nextModel}).`,
        )
        return
      }

      const savedCloudProvider = existingKeys.find(
        (key): key is typeof key & { provider: Provider } =>
          key.provider !== 'ollama' && key.isActive && isProvider(key.provider),
      )?.provider
      if (!savedCloudProvider) {
        setError('No active cloud provider configured. Save a key for Anthropic, OpenAI, or Google first.')
        return
      }
      const cloudModelOptions = providerModels(savedCloudProvider)
      const nextModel = cloudModelOptions[0] ?? activeModel

      setActiveProvider(savedCloudProvider)
      setActiveModel(nextModel)
      await sdk.users.updateSettings({
        preferredProvider: savedCloudProvider,
        preferredModel: nextModel,
        customSystemPrompt: customSystemPrompt.trim() || null,
      })
      setStatus(`Switched to ${PROVIDER_META[savedCloudProvider].label}.`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to switch local LLM mode')
    } finally {
      setIsSwitchingLocal(false)
    }
  }

  function updateCard(provider: Provider, patch: Partial<ProviderCardState>) {
    setCards((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }))
  }

  async function handleTest(provider: Provider) {
    const card = cards[provider]
    updateCard(provider, { testStatus: 'testing', testModel: '', testError: '' })
    try {
      const ollamaTestModel = provider === 'ollama'
        ? resolveOllamaModel(activeModel, modelOptions)
        : undefined
      if (provider === 'ollama' && !ollamaTestModel) {
        updateCard(provider, { testStatus: 'error', testError: 'No Ollama model selected. Pick one from the dropdown above.' })
        return
      }
      const result = await sdk.agent.testLlmConnection({
        provider,
        apiKey: provider !== 'ollama' ? card.apiKey || undefined : undefined,
        baseUrl: provider === 'ollama' ? card.baseUrl || undefined : undefined,
        model: ollamaTestModel,
      })
      if (result.ok) {
        updateCard(provider, { testStatus: 'ok', testModel: result.model ?? '' })
      } else {
        updateCard(provider, { testStatus: 'error', testError: result.error ?? 'Failed' })
      }
    } catch (err: any) {
      updateCard(provider, { testStatus: 'error', testError: err?.message ?? 'Connection failed' })
    }
  }

  async function handleTestAll() {
    setIsTestingAll(true)
    setError('')
    setStatus('')
    try {
      for (const provider of PROVIDERS) {
        await handleTest(provider)
      }
      setStatus('Finished testing all providers.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to test all providers')
    } finally {
      setIsTestingAll(false)
    }
  }

  async function handleSaveKey(provider: Provider) {
    const card = cards[provider]
    updateCard(provider, { isSaving: true })
    setError('')
    setStatus('')
    try {
      if (provider === 'ollama') {
        await sdk.users.upsertLlmKey(provider, { baseUrl: card.baseUrl, isActive: true })
        await loadOllamaModels(card.baseUrl || undefined)
      } else {
        if (!card.apiKey) return
        await sdk.users.upsertLlmKey(provider, { apiKey: card.apiKey, isActive: true })
      }
      setStatus(`${PROVIDER_META[provider].label} key saved.`)
      // refresh stored keys
      const keys = await sdk.users.getLlmKeys()
      setExistingKeys(keys)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save key')
    } finally {
      updateCard(provider, { isSaving: false })
    }
  }

  async function handleRemoveKey(provider: Provider) {
    setError('')
    setStatus('')
    try {
      await sdk.users.deleteLlmKey(provider)
      updateCard(provider, { apiKey: '', testStatus: 'idle', testModel: '', testError: '' })
      if (provider === 'ollama') {
        updateCard(provider, { baseUrl: DEFAULTS.ollama.baseUrl })
        setOllamaModels([])
        setOllamaModelsStatus('idle')
        setOllamaModelsError('')
      }
      setStatus(`${PROVIDER_META[provider].label} key removed.`)
      const keys = await sdk.users.getLlmKeys()
      setExistingKeys(keys)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove key')
    }
  }

  function updateDomainDraft(id: string, patch: Partial<DomainDraft>) {
    setDomainDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {
          provider: 'manual',
          status: 'pending',
          targetHost: '',
          proxyInstructions: '',
        }),
        ...patch,
      },
    }))
  }

  async function handleAddDomain() {
    const candidate = newDomain.trim()
    if (!candidate) {
      setError('Domain is required.')
      return
    }

    setIsSavingDomain(true)
    setError('')
    setStatus('')

    try {
      const created = await sdk.users.createDomain({
        domain: candidate,
        provider: newDomainProvider,
        status: newDomainStatus,
        targetHost: newDomainTargetHost.trim() || null,
        proxyInstructions: newDomainInstructions.trim() || null,
      })
      setDomains((prev) => [created, ...prev])
      setDomainDrafts((prev) => ({ ...prev, [created.id]: toDomainDraft(created) }))
      setNewDomain('')
      setNewDomainProvider('manual')
      setNewDomainStatus('pending')
      setNewDomainTargetHost('')
      setNewDomainInstructions('')
      setStatus(`Domain ${created.domain} added.`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add domain')
    } finally {
      setIsSavingDomain(false)
    }
  }

  async function handleSaveDomain(id: string) {
    const draft = domainDrafts[id]
    if (!draft) {
      return
    }

    setUpdatingDomainId(id)
    setError('')
    setStatus('')

    try {
      const updated = await sdk.users.updateDomain(id, {
        provider: draft.provider,
        status: draft.status,
        targetHost: draft.targetHost.trim() || null,
        proxyInstructions: draft.proxyInstructions.trim() || null,
      })
      setDomains((prev) => prev.map((domain) => (domain.id === id ? updated : domain)))
      setDomainDrafts((prev) => ({ ...prev, [id]: toDomainDraft(updated) }))
      setStatus(`Domain ${updated.domain} updated.`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update domain')
    } finally {
      setUpdatingDomainId((current) => (current === id ? null : current))
    }
  }

  async function handleDeleteDomain(id: string) {
    const domainLabel = domains.find((domain) => domain.id === id)?.domain ?? 'Domain'
    setDeletingDomainId(id)
    setError('')
    setStatus('')

    try {
      await sdk.users.deleteDomain(id)
      setDomains((prev) => prev.filter((domain) => domain.id !== id))
      setDomainDrafts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setStatus(`${domainLabel} removed.`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove domain')
    } finally {
      setDeletingDomainId((current) => (current === id ? null : current))
    }
  }

  const providers: Provider[] = PROVIDERS

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Config</h1>
          <p className="mt-1 text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{profileEmail || '…'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {/* ── Active Provider Bar ── */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-5 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,63,94,0.08),transparent_60%)]" />
        <div className="relative">
          <h2 className="text-base font-semibold text-slate-900">Active LLM</h2>
          <p className="mt-0.5 text-xs text-slate-500">The provider and model used for every agent run.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void switchLocalAndSave(activeProvider !== 'ollama')}
              disabled={isSwitchingLocal}
              className={`h-9 rounded-lg px-3 text-xs font-semibold transition disabled:opacity-50 ${
                activeProvider === 'ollama'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {isSwitchingLocal
                ? 'Switching...'
                : activeProvider === 'ollama'
                  ? 'Using Local LLM (Switch to Cloud)'
                  : 'Switch to Local LLM (Save)'}
            </button>
            <span className="text-[11px] text-slate-500">Saves provider + model for all next runs.</span>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {/* Provider select */}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Provider</span>
              <select
                value={activeProvider}
                onChange={(e) => setActiveProvider(e.target.value as Provider)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              >
                {providers.map((p) => (
                  <option key={p} value={p}>{PROVIDER_META[p].label}</option>
                ))}
              </select>
            </label>

            {/* Model select */}
            <label className="flex min-w-[280px] flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Model</span>
              <div className="flex items-center gap-2">
                {activeProvider === 'ollama' ? (
                  modelOptions.length > 0 ? (
                    <select
                      value={activeModel}
                      onChange={(e) => setActiveModel(e.target.value)}
                      className="h-10 min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    >
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={activeModel}
                      onChange={(e) => setActiveModel(e.target.value)}
                      placeholder="Type model id (e.g. llama3.2)"
                      className="h-10 min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  )
                ) : (
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value)}
                    className="h-10 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )}

                {activeProvider === 'ollama' && (
                  <button
                    type="button"
                    onClick={() => void loadOllamaModels(cards.ollama.baseUrl || undefined)}
                    disabled={ollamaModelsStatus === 'loading'}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {ollamaModelsStatus === 'loading' ? 'Loading...' : 'Refresh models'}
                  </button>
                )}
              </div>

              {activeProvider === 'ollama' && (
                <span className={`text-[11px] ${ollamaModelsStatus === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
                  {ollamaModelsStatus === 'loaded' && ollamaModels.length > 0 && `Found ${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'} via Ollama.`}
                  {ollamaModelsStatus === 'loaded' && ollamaModels.length === 0 && 'No local models found. Run "ollama pull <model>".'}
                  {ollamaModelsStatus === 'error' && `Could not load local models: ${ollamaModelsError}`}
                  {ollamaModelsStatus === 'idle' && 'Load models from your local Ollama server.'}
                </span>
              )}
            </label>

            <div className="flex flex-col items-start gap-1">
              <button
                type="button"
                onClick={() => void handleSaveActive()}
                disabled={isSavingActive}
                className={`h-10 rounded-lg px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors ${
                  savedActiveLabel ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isSavingActive ? 'Saving…' : savedActiveLabel ? 'Saved ✓' : 'Save'}
              </button>
              {savedActiveLabel && (
                <span className="text-[11px] text-emerald-600 font-medium">{savedActiveLabel}</span>
              )}
            </div>
          </div>

          {/* Custom system prompt */}
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500">Custom System Prompt</span>
            <textarea
              value={customSystemPrompt}
              onChange={(e) => setCustomSystemPrompt(e.target.value)}
              rows={4}
              placeholder="Override the default system prompt…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>
      </section>

      {/* ── Provider Cards ── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleTestAll()}
          disabled={isTestingAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isTestingAll ? 'Testing all…' : 'Test All Providers'}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {providers.map((provider) => {
          const meta = PROVIDER_META[provider]
          const card = cards[provider]
          const existing = existingKeys.find((k) => k.provider === provider)
          const isConfigured = !!existing
          const isActive = activeProvider === provider

          return (
            <div
              key={provider}
              className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                isActive ? `ring-2 ${meta.ring} border-transparent` : 'border-slate-200'
              }`}
            >
              {/* Card header */}
              <div className={`bg-gradient-to-br ${meta.gradient} px-4 py-3 text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {meta.icon}
                    <span className="font-semibold">{meta.label}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isConfigured
                        ? 'bg-white/20 text-white'
                        : 'bg-black/10 text-white/70'
                    }`}
                  >
                    {isConfigured ? 'Configured' : 'Not set'}
                  </span>
                </div>
                {isActive && (
                  <p className="mt-1 text-[11px] text-white/80">Active provider</p>
                )}
              </div>

              {/* Card body */}
              <div className="flex flex-1 flex-col gap-3 p-4">
                {meta.isKeyless ? (
                  /* Ollama: URL input */
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">{meta.inputLabel}</span>
                    <input
                      type="text"
                      value={card.baseUrl}
                      onChange={(e) => updateCard(provider, { baseUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="text-[11px] italic text-slate-400">Ollama must be running locally</p>
                  </label>
                ) : (
                  /* Anthropic / OpenAI: masked key input */
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">
                      {meta.inputLabel}
                      {isConfigured && (
                        <span className="ml-1 font-normal text-slate-400">
                          (stored: {existing.apiKey ?? '—'})
                        </span>
                      )}
                    </span>
                    <div className="relative">
                      <input
                        type={card.showKey ? 'text' : 'password'}
                        value={card.apiKey}
                        onChange={(e) => updateCard(provider, { apiKey: e.target.value })}
                        placeholder={isConfigured ? 'Enter new key to update…' : 'sk-…'}
                        className="h-9 w-full rounded-lg border border-slate-200 py-0 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      />
                      <button
                        type="button"
                        onClick={() => updateCard(provider, { showKey: !card.showKey })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {card.showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                )}

                {/* Test result */}
                {card.testStatus !== 'idle' && (
                  <div className={`flex items-center gap-1.5 text-xs ${
                    card.testStatus === 'ok' ? 'text-emerald-600' :
                    card.testStatus === 'error' ? 'text-red-500' : 'text-slate-500'
                  }`}>
                    {card.testStatus === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {card.testStatus === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {card.testStatus === 'error' && <XCircle className="h-3.5 w-3.5" />}
                    <span>
                      {card.testStatus === 'testing' && 'Testing connection…'}
                      {card.testStatus === 'ok' && `Connected · ${card.testModel}`}
                      {card.testStatus === 'error' && card.testError}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleTest(provider)}
                    disabled={card.testStatus === 'testing'}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {card.testStatus === 'testing' ? 'Testing…' : 'Test'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveKey(provider)}
                    disabled={card.isSaving || (!meta.isKeyless && !card.apiKey)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 bg-gradient-to-br ${meta.gradient}`}
                  >
                    {card.isSaving ? 'Saving…' : 'Save Key'}
                  </button>

                  {isConfigured && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveKey(provider)}
                      className="ml-auto text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* Domains */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-5 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.1),transparent_60%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Domains and Public Access</h2>
              <p className="mt-1 text-xs text-slate-500">
                Add each domain you want to use and store reverse-proxy setup details for Ubuntu deployment.
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {domains.length} domain{domains.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="rounded-xl border border-sky-100 bg-white/90 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Plus className="h-4 w-4 text-sky-600" />
              Add domain
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="flex flex-col gap-1 lg:col-span-2">
                <span className="text-xs font-medium text-slate-500">Domain</span>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                  placeholder="agent.example.com"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Provider</span>
                <select
                  value={newDomainProvider}
                  onChange={(event) => setNewDomainProvider(event.target.value as UserDomainProvider)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  {DOMAIN_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {DOMAIN_PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Status</span>
                <select
                  value={newDomainStatus}
                  onChange={(event) => setNewDomainStatus(event.target.value as UserDomainStatus)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  {DOMAIN_STATUSES.map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {DOMAIN_STATUS_LABELS[statusValue]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Target host (optional)</span>
                <input
                  type="text"
                  value={newDomainTargetHost}
                  onChange={(event) => setNewDomainTargetHost(event.target.value)}
                  placeholder={DEFAULT_DOMAIN_TARGET_HOST}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Proxy notes (optional)</span>
                <input
                  type="text"
                  value={newDomainInstructions}
                  onChange={(event) => setNewDomainInstructions(event.target.value)}
                  placeholder="Use Caddy on port 443 and forward to 3000"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAddDomain()}
                disabled={isSavingDomain}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {isSavingDomain ? 'Adding...' : 'Add domain'}
              </button>
              <span className="text-[11px] text-slate-500">
                Use the host and port where your OpenAgents web app is listening on Ubuntu.
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Link2 className="h-4 w-4 text-slate-600" />
              External access checklist
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
              <li>Create DNS records (A/AAAA or CNAME) pointing your domain to your public server IP.</li>
              <li>Allow inbound ports 80 and 443 in Ubuntu firewall and cloud security rules.</li>
              <li>Run a reverse proxy (Caddy/Nginx/Cloudflare) forwarding your domain to the target host.</li>
              <li>Enable HTTPS and then test from a different network, not only localhost.</li>
            </ol>
          </div>

          {domains.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
              No domains added yet.
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map((domain) => {
                const draft = domainDrafts[domain.id] ?? toDomainDraft(domain)
                const isSaving = updatingDomainId === domain.id
                const isDeleting = deletingDomainId === domain.id
                const snippet = domainSetupSnippet(domain.domain, draft.provider, draft.targetHost)

                return (
                  <article key={domain.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{domain.domain}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Last updated {new Date(domain.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDomain(domain.id)}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isDeleting ? 'Removing...' : 'Remove'}
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">Provider</span>
                        <select
                          value={draft.provider}
                          onChange={(event) => updateDomainDraft(domain.id, { provider: event.target.value as UserDomainProvider })}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        >
                          {DOMAIN_PROVIDERS.map((provider) => (
                            <option key={provider} value={provider}>
                              {DOMAIN_PROVIDER_LABELS[provider]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) => updateDomainDraft(domain.id, { status: event.target.value as UserDomainStatus })}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        >
                          {DOMAIN_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                              {DOMAIN_STATUS_LABELS[statusValue]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">Target host</span>
                        <input
                          type="text"
                          value={draft.targetHost}
                          onChange={(event) => updateDomainDraft(domain.id, { targetHost: event.target.value })}
                          placeholder={DEFAULT_DOMAIN_TARGET_HOST}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      </label>
                    </div>

                    <label className="mt-3 flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">Proxy notes</span>
                      <textarea
                        value={draft.proxyInstructions}
                        onChange={(event) => updateDomainDraft(domain.id, { proxyInstructions: event.target.value })}
                        rows={2}
                        placeholder="Optional notes for your deployment"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveDomain(domain.id)}
                        disabled={isSaving || isDeleting}
                        className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save domain settings'}
                      </button>
                      <span className="text-[11px] text-slate-500">
                        Provider template: {DOMAIN_PROVIDER_LABELS[draft.provider]}
                      </span>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-950 p-3">
                      <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-100">{snippet}</pre>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Status / Error */}
      {(error || status) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || status}
        </div>
      )}
    </div>
  )
}
