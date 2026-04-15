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
import { LLM_MODEL_OPTIONS, LLM_PROVIDER_CAPABILITIES } from '@openagents/shared'

// Types

type Provider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'minimax' | 'perplexity'

const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google', 'perplexity', 'minimax', 'ollama']
const CLOUD_PROVIDERS = ['anthropic', 'openai', 'google', 'perplexity', 'minimax'] as const
const DEFAULT_OLLAMA_BASE_URL = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL?.trim() || 'http://localhost:11434'

interface ProviderCardState {
  apiKey: string
  baseUrl: string
  showKey: boolean
  loginEmail: string
  loginPassword: string
  showLoginPassword: boolean
  subscriptionPlan: string
  testStatus: 'idle' | 'testing' | 'ok' | 'error'
  testModel: string
  testError: string
  isSaving: boolean
}

const DEFAULTS: Record<Provider, ProviderCardState> = {
  anthropic: { apiKey: '', baseUrl: '', showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  openai:    { apiKey: '', baseUrl: '', showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  google:    { apiKey: '', baseUrl: '', showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  perplexity:{ apiKey: '', baseUrl: '', showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  minimax:   { apiKey: '', baseUrl: '', showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
  ollama:    { apiKey: '', baseUrl: DEFAULT_OLLAMA_BASE_URL, showKey: false, loginEmail: '', loginPassword: '', showLoginPassword: false, subscriptionPlan: '', testStatus: 'idle', testModel: '', testError: '', isSaving: false },
}
const OLLAMA_FALLBACK_MODELS: string[] = [...(LLM_MODEL_OPTIONS.ollama as unknown as string[])]
const PROVIDER_PLAN_OPTIONS: Record<Exclude<Provider, 'ollama'>, string[]> = {
  anthropic: ['Free', 'Pro', 'Max', 'Team', 'Enterprise'],
  openai: ['Free', 'Plus (Codex)', 'Pro (Codex)', 'Team', 'Enterprise'],
  google: ['Free', 'AI Pro', 'AI Ultra', 'Workspace Enterprise'],
  perplexity: ['Starter', 'Pro', 'Enterprise'],
  minimax: ['Starter', 'Pro', 'Enterprise'],
}

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
  perplexity: {
    label: 'Perplexity',
    icon: <Link2 className="h-5 w-5" />,
    gradient: 'from-cyan-500 to-sky-600',
    ring: 'ring-cyan-400',
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

function describeModelSelection(provider: Provider, model: string) {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return 'Pick a model that matches the run type: large models for complex tool chains, smaller ones for fast chat turns.'
  if (provider === 'ollama') {
    return normalized.includes('code')
      ? 'Local coding-oriented model. Good for privacy-sensitive development tasks, but verify tool-heavy runs.'
      : 'Local model selection. Quality and tool reliability depend on the model you have installed.'
  }
  if (
    normalized.includes('mini')
    || normalized.includes('nano')
    || normalized.includes('flash-lite')
    || normalized.includes('haiku')
  ) {
    return 'Fast/cheap tier. Good for lightweight chat and classification, but less reliable for long tool chains.'
  }
  if (
    normalized.includes('opus')
    || normalized.includes('sonnet')
    || normalized.includes('gpt-5.1')
    || normalized.includes('gemini-3.1')
    || normalized.includes('pro')
  ) {
    return 'Higher-capability tier. Prefer this for multi-step reasoning, approvals, workflows, and tool orchestration.'
  }
  return 'Balanced tier. Good default when you want decent reasoning without the slowest or most expensive option.'
}

// Main Page

export default function ConfigPage() {
  const [profileEmail, setProfileEmail] = useState('')
  const [activeProvider, setActiveProvider] = useState<Provider>('anthropic')
  const [activeModel, setActiveModel] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [cards, setCards] = useState<Record<Provider, ProviderCardState>>({ ...DEFAULTS })
  const [existingKeys, setExistingKeys] = useState<LlmApiKey[]>([])
  const [fallbackKeys, setFallbackKeys] = useState<Record<string, Array<{ id: string; label: string | null; priority: number; isActive: boolean; createdAt: string }>>>({})
  const [newFallbackKey, setNewFallbackKey] = useState<Record<string, string>>({})
  const [newFallbackLabel, setNewFallbackLabel] = useState<Record<string, string>>({})
  const [isAddingFallback, setIsAddingFallback] = useState<Record<string, boolean>>({})
  const [removingFallbackId, setRemovingFallbackId] = useState<string | null>(null)
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
  const providerCapability = LLM_PROVIDER_CAPABILITIES[activeProvider]

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
      const [profile, settings, keys, domainList, ...fallbackResults] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.users.getLlmKeys(),
        sdk.users.listDomains(),
        ...CLOUD_PROVIDERS.map((p) =>
          sdk.users.listFallbackLlmKeys(p).then((list) => ({ provider: p, list })).catch(() => ({ provider: p, list: [] as Array<{ id: string; label: string | null; priority: number; isActive: boolean; createdAt: string }> })),
        ),
      ])
      const nextFallbackKeys: Record<string, Array<{ id: string; label: string | null; priority: number; isActive: boolean; createdAt: string }>> = {}
      for (const { provider, list } of fallbackResults as Array<{ provider: string; list: Array<{ id: string; label: string | null; priority: number; isActive: boolean; createdAt: string }> }>) {
        nextFallbackKeys[provider] = list
      }
      setFallbackKeys(nextFallbackKeys)
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

      const nextCards: Record<Provider, ProviderCardState> = {
        anthropic: { ...DEFAULTS.anthropic },
        openai: { ...DEFAULTS.openai },
        google: { ...DEFAULTS.google },
        perplexity: { ...DEFAULTS.perplexity },
        minimax: { ...DEFAULTS.minimax },
        ollama: { ...DEFAULTS.ollama },
      }

      for (const key of keys) {
        if (!isProvider(key.provider)) continue
        if (key.provider === 'ollama') {
          nextCards.ollama.baseUrl = key.baseUrl ?? DEFAULTS.ollama.baseUrl
          continue
        }

        nextCards[key.provider].loginEmail = key.loginEmail ?? ''
        nextCards[key.provider].subscriptionPlan = key.subscriptionPlan ?? ''
      }

      setCards(nextCards)
      const ollamaBaseUrl = nextCards.ollama.baseUrl

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
      const label = `${PROVIDER_META[activeProvider].label} - ${preferredModelToSave}`
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
          setError('No Ollama models found at the configured endpoint. Run "ollama pull <model>" then click Refresh models.')
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
        setError('No active cloud provider configured. Save a key for Anthropic, OpenAI, Google, Perplexity, or MiniMax first.')
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
        apiKey: provider !== 'ollama'
          ? (card.apiKey.trim() || card.loginPassword.trim() || undefined)
          : undefined,
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
        const existing = existingKeys.find((k) => k.provider === provider)
        const apiKey = card.apiKey.trim()
        const loginEmail = card.loginEmail.trim()
        const loginPassword = card.loginPassword.trim()
        const hasApiKey = apiKey.length > 0
        const hasStoredLogin = Boolean(existing?.loginEmail && existing?.loginPassword)
        const hasLoginEmail = loginEmail.length > 0
        const hasLoginPassword = loginPassword.length > 0
        const hasLoginPair = hasLoginEmail && hasLoginPassword
        const matchesStoredLoginEmail = hasLoginEmail
          && loginEmail === (existing?.loginEmail ?? '').trim()
        let shouldSendLoginCredentials = false

        if (hasLoginEmail || hasLoginPassword) {
          if (!hasLoginPair) {
            const keepStoredLogin = hasStoredLogin && hasLoginEmail && !hasLoginPassword && matchesStoredLoginEmail
            if (!keepStoredLogin) {
              setError('Provider login email and password must be entered together.')
              return
            }
          } else {
            shouldSendLoginCredentials = true
          }
        }

        if (!hasApiKey && !hasLoginPair && !existing) {
          setError('Enter an API key or provider login credentials before saving.')
          return
        }

        await sdk.users.upsertLlmKey(provider, {
          apiKey: hasApiKey ? apiKey : undefined,
          loginEmail: shouldSendLoginCredentials ? loginEmail : undefined,
          loginPassword: shouldSendLoginCredentials ? loginPassword : undefined,
          subscriptionPlan: card.subscriptionPlan,
          isActive: true,
        })
        updateCard(provider, { loginPassword: '' })
      }
      setStatus(`${PROVIDER_META[provider].label} credentials saved.`)
      // refresh stored keys
      const keys = await sdk.users.getLlmKeys()
      setExistingKeys(keys)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save credentials')
    } finally {
      updateCard(provider, { isSaving: false })
    }
  }

  async function handleRemoveKey(provider: Provider) {
    setError('')
    setStatus('')
    try {
      await sdk.users.deleteLlmKey(provider)
      updateCard(provider, {
        apiKey: '',
        loginEmail: '',
        loginPassword: '',
        showLoginPassword: false,
        subscriptionPlan: '',
        testStatus: 'idle',
        testModel: '',
        testError: '',
      })
      if (provider === 'ollama') {
        updateCard(provider, { baseUrl: DEFAULTS.ollama.baseUrl })
        setOllamaModels([])
        setOllamaModelsStatus('idle')
        setOllamaModelsError('')
      }
      setStatus(`${PROVIDER_META[provider].label} credentials removed.`)
      const keys = await sdk.users.getLlmKeys()
      setExistingKeys(keys)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove key')
    }
  }

  async function handleAddFallbackKey(provider: Provider) {
    const key = (newFallbackKey[provider] ?? '').trim()
    if (!key) return
    setIsAddingFallback((prev) => ({ ...prev, [provider]: true }))
    setError('')
    try {
      const label = (newFallbackLabel[provider] ?? '').trim() || undefined
      const created = await sdk.users.addFallbackLlmKey(provider, key, label)
      setFallbackKeys((prev) => ({ ...prev, [provider]: [...(prev[provider] ?? []), created] }))
      setNewFallbackKey((prev) => ({ ...prev, [provider]: '' }))
      setNewFallbackLabel((prev) => ({ ...prev, [provider]: '' }))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add fallback key')
    } finally {
      setIsAddingFallback((prev) => ({ ...prev, [provider]: false }))
    }
  }

  async function handleRemoveFallbackKey(provider: Provider, id: string) {
    setRemovingFallbackId(id)
    setError('')
    try {
      await sdk.users.removeFallbackLlmKey(provider, id)
      setFallbackKeys((prev) => ({ ...prev, [provider]: (prev[provider] ?? []).filter((k) => k.id !== id) }))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove fallback key')
    } finally {
      setRemovingFallbackId(null)
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
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Config</h1>
          <p className="mt-1 text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{profileEmail || '...'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {/* Active Provider Bar */}
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
            <label className="flex w-full flex-col gap-1 sm:w-auto">
              <span className="text-xs font-medium text-slate-500">Provider</span>
              <select
                value={activeProvider}
                onChange={(e) => setActiveProvider(e.target.value as Provider)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 sm:w-auto"
              >
                {providers.map((p) => (
                  <option key={p} value={p}>{PROVIDER_META[p].label}</option>
                ))}
              </select>
            </label>

            {/* Model select */}
            <label className="flex w-full flex-col gap-1 sm:min-w-[280px]">
              <span className="text-xs font-medium text-slate-500">Model</span>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {activeProvider === 'ollama' ? (
                  modelOptions.length > 0 ? (
                    <select
                      value={activeModel}
                      onChange={(e) => setActiveModel(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 sm:min-w-[240px]"
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
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 sm:min-w-[240px]"
                    />
                  )
                ) : (
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 sm:min-w-[180px]"
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                  >
                    {ollamaModelsStatus === 'loading' ? 'Loading...' : 'Refresh models'}
                  </button>
                )}
              </div>

              {activeProvider === 'ollama' && (
                <span className={`text-[11px] ${ollamaModelsStatus === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
                  {ollamaModelsStatus === 'loaded' && ollamaModels.length > 0 && `Found ${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'} via Ollama.`}
                  {ollamaModelsStatus === 'loaded' && ollamaModels.length === 0 && 'No Ollama models found at this endpoint. Run "ollama pull <model>".'}
                  {ollamaModelsStatus === 'error' && `Could not load local models: ${ollamaModelsError}`}
                  {ollamaModelsStatus === 'idle' && 'Load models from your configured Ollama server.'}
                </span>
              )}
            </label>

            <div className="flex w-full flex-col items-start gap-1 sm:w-auto">
              <button
                type="button"
                onClick={() => void handleSaveActive()}
                disabled={isSavingActive}
                className={`h-10 w-full rounded-lg px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors sm:w-auto ${
                  savedActiveLabel ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isSavingActive ? 'Saving...' : savedActiveLabel ? 'Saved' : 'Save'}
              </button>
              {savedActiveLabel && (
                <span className="text-[11px] text-emerald-600 font-medium">{savedActiveLabel}</span>
              )}
            </div>
          </div>

          {/* Custom system prompt */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {providerCapability.label} routing profile
                </p>
                <p className="mt-1 text-xs text-slate-500">{providerCapability.bestFor}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  tool use: {providerCapability.toolUse}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  latency: {providerCapability.latency}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  context: {providerCapability.contextProfile}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Strengths</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {providerCapability.strengths.map((strength) => (
                    <span key={strength} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Routing caution</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {providerCapability.cautions.map((caution) => (
                    <span key={caution} className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                      {caution}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Selected model hint: {describeModelSelection(activeProvider, activeModel)}
            </p>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500">Custom System Prompt</span>
            <textarea
              value={customSystemPrompt}
              onChange={(e) => setCustomSystemPrompt(e.target.value)}
              rows={4}
              placeholder="Override the default system prompt..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>
      </section>

      {/* Provider Cards */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleTestAll()}
          disabled={isTestingAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isTestingAll ? 'Testing all...' : 'Test All Providers'}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {providers.map((provider) => {
          const meta = PROVIDER_META[provider]
          const card = cards[provider]
          const existing = existingKeys.find((k) => k.provider === provider)
          const isConfigured = !!existing
          const isActive = activeProvider === provider
          const planOptions = provider === 'ollama' ? [] : PROVIDER_PLAN_OPTIONS[provider]
          const hasLoginPair = card.loginEmail.trim().length > 0 && card.loginPassword.trim().length > 0
          const canSaveCredentials =
            meta.isKeyless
            || card.apiKey.trim().length > 0
            || hasLoginPair
            || Boolean(existing)

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
                      placeholder={DEFAULT_OLLAMA_BASE_URL}
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="text-[11px] italic text-slate-400">Ollama must be reachable from the API server host</p>
                  </label>
                ) : (
                  /* Cloud providers: API key + account login + plan */
                  <div className="space-y-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">
                        {meta.inputLabel}
                        {isConfigured && (
                          <span className="ml-1 font-normal text-slate-400">
                            (stored: {existing?.apiKey ?? 'not-set'})
                          </span>
                        )}
                      </span>
                      <div className="relative">
                        <input
                          type={card.showKey ? 'text' : 'password'}
                          value={card.apiKey}
                          onChange={(e) => updateCard(provider, { apiKey: e.target.value })}
                          placeholder={isConfigured ? 'Enter new key to update...' : 'sk-...'}
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

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">
                        Login Email
                        {existing?.loginEmail && (
                          <span className="ml-1 font-normal text-slate-400">(stored: {existing.loginEmail})</span>
                        )}
                      </span>
                      <input
                        type="email"
                        value={card.loginEmail}
                        onChange={(e) => updateCard(provider, { loginEmail: e.target.value })}
                        placeholder="you@example.com"
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">
                        Login Password / Token
                        {existing?.loginPassword && (
                          <span className="ml-1 font-normal text-slate-400">(stored: {existing.loginPassword})</span>
                        )}
                      </span>
                      <div className="relative">
                        <input
                          type={card.showLoginPassword ? 'text' : 'password'}
                          value={card.loginPassword}
                          onChange={(e) => updateCard(provider, { loginPassword: e.target.value })}
                          placeholder={existing?.loginPassword ? 'Enter new password/token to update...' : 'Password or token'}
                          className="h-9 w-full rounded-lg border border-slate-200 py-0 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                        />
                        <button
                          type="button"
                          onClick={() => updateCard(provider, { showLoginPassword: !card.showLoginPassword })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {card.showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">Subscription Plan</span>
                      <select
                        value={card.subscriptionPlan}
                        onChange={(event) => updateCard(provider, { subscriptionPlan: event.target.value })}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      >
                        <option value="">Not set</option>
                        {planOptions.map((plan) => (
                          <option key={plan} value={plan}>
                            {plan}
                          </option>
                        ))}
                        {card.subscriptionPlan && !planOptions.includes(card.subscriptionPlan) && (
                          <option value={card.subscriptionPlan}>{card.subscriptionPlan}</option>
                        )}
                      </select>
                    </label>

                    <p className="text-[11px] text-slate-400">
                      If API key is blank, password/token is used as provider auth token.
                    </p>
                  </div>
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
                      {card.testStatus === 'testing' && 'Testing connection...'}
                      {card.testStatus === 'ok' && `Connected - ${card.testModel}`}
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
                    {card.testStatus === 'testing' ? 'Testing...' : 'Test'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveKey(provider)}
                    disabled={card.isSaving || !canSaveCredentials}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 bg-gradient-to-br ${meta.gradient}`}
                  >
                    {card.isSaving ? 'Saving...' : 'Save Credentials'}
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
      {/* Fallback / Rotation Keys */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">API Key Rotation &amp; Failover</h2>
            <p className="mt-1 text-xs text-slate-500">
              Add backup keys for each provider. When the primary key hits a rate-limit (429) or auth error (401), the next key is tried automatically.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CLOUD_PROVIDERS.map((provider) => {
            const meta = PROVIDER_META[provider]
            const providerFallbacks = fallbackKeys[provider] ?? []
            return (
              <div key={provider} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${meta.gradient} text-white`}>
                    {meta.icon}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {providerFallbacks.length} backup{providerFallbacks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5">
                  {providerFallbacks.map((fb, idx) => (
                    <div key={fb.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
                      <span className="shrink-0 font-mono text-slate-400">#{idx + 1}</span>
                      <span className="flex-1 truncate text-slate-700">{fb.label || `Backup key ${idx + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveFallbackKey(provider, fb.id)}
                        disabled={removingFallbackId === fb.id}
                        className="shrink-0 text-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-1.5">
                  <input
                    type="password"
                    value={newFallbackKey[provider] ?? ''}
                    onChange={(e) => setNewFallbackKey((prev) => ({ ...prev, [provider]: e.target.value }))}
                    placeholder="sk-..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-rose-200 focus:ring-1 focus:ring-rose-100"
                  />
                  <input
                    type="text"
                    value={newFallbackLabel[provider] ?? ''}
                    onChange={(e) => setNewFallbackLabel((prev) => ({ ...prev, [provider]: e.target.value }))}
                    placeholder="Label (optional)"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-rose-200 focus:ring-1 focus:ring-rose-100"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddFallbackKey(provider)}
                    disabled={isAddingFallback[provider] || !(newFallbackKey[provider] ?? '').trim()}
                    className={`flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-br ${meta.gradient} text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isAddingFallback[provider] ? 'Adding...' : 'Add Backup Key'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

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
