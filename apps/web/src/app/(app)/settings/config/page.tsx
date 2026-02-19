'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import {
  KeyRound,
  Cpu,
  Globe2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import type { LlmApiKey } from '@openagents/shared'
import { LLM_MODEL_OPTIONS } from '@openagents/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai' | 'ollama'

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
  ollama:    { apiKey: '', baseUrl: 'http://localhost:11434', showKey: false, testStatus: 'idle', testModel: '', testError: '', isSaving: false },
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
  ollama: {
    label: 'Ollama',
    icon: <Globe2 className="h-5 w-5" />,
    gradient: 'from-indigo-500 to-violet-600',
    ring: 'ring-indigo-400',
    inputLabel: 'Server URL',
    isKeyless: true,
  },
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [profileEmail, setProfileEmail] = useState('')
  const [activeProvider, setActiveProvider] = useState<Provider>('anthropic')
  const [activeModel, setActiveModel] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [cards, setCards] = useState<Record<Provider, ProviderCardState>>({ ...DEFAULTS })
  const [existingKeys, setExistingKeys] = useState<LlmApiKey[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [isSavingActive, setIsSavingActive] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const modelOptions: string[] = LLM_MODEL_OPTIONS[activeProvider] as unknown as string[] ?? []

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    setStatus('')
    try {
      const [profile, settings, keys] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.users.getLlmKeys(),
      ])
      setProfileEmail(profile.email ?? '')
      setActiveProvider((settings.preferredProvider as Provider) ?? 'anthropic')
      setActiveModel(settings.preferredModel ?? '')
      setCustomSystemPrompt(settings.customSystemPrompt ?? '')
      setExistingKeys(keys)

      // Pre-fill baseUrl for ollama if stored
      const ollamaKey = keys.find((k) => k.provider === 'ollama')
      if (ollamaKey?.baseUrl) {
        setCards((prev) => ({
          ...prev,
          ollama: { ...prev.ollama, baseUrl: ollamaKey.baseUrl! },
        }))
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load config')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // When active provider changes, sync model to first available option if current doesn't match
  useEffect(() => {
    const options = LLM_MODEL_OPTIONS[activeProvider] as unknown as string[]
    if (options && !options.includes(activeModel)) {
      setActiveModel(options[0] ?? '')
    }
  }, [activeProvider])

  async function handleSaveActive() {
    setIsSavingActive(true)
    setError('')
    setStatus('')
    try {
      await sdk.users.updateSettings({
        preferredProvider: activeProvider,
        preferredModel: activeModel,
        customSystemPrompt: customSystemPrompt.trim() || null,
      })
      setStatus('Active provider saved.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save')
    } finally {
      setIsSavingActive(false)
    }
  }

  function updateCard(provider: Provider, patch: Partial<ProviderCardState>) {
    setCards((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }))
  }

  async function handleTest(provider: Provider) {
    const card = cards[provider]
    updateCard(provider, { testStatus: 'testing', testModel: '', testError: '' })
    try {
      const result = await sdk.agent.testLlmConnection({
        provider,
        apiKey: provider !== 'ollama' ? card.apiKey || undefined : undefined,
        baseUrl: provider === 'ollama' ? card.baseUrl || undefined : undefined,
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

  async function handleSaveKey(provider: Provider) {
    const card = cards[provider]
    updateCard(provider, { isSaving: true })
    setError('')
    setStatus('')
    try {
      if (provider === 'ollama') {
        await sdk.users.upsertLlmKey(provider, { baseUrl: card.baseUrl, isActive: true })
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
      if (provider === 'ollama') updateCard(provider, { baseUrl: DEFAULTS.ollama.baseUrl })
      setStatus(`${PROVIDER_META[provider].label} key removed.`)
      const keys = await sdk.users.getLlmKeys()
      setExistingKeys(keys)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove key')
    }
  }

  const providers: Provider[] = ['anthropic', 'openai', 'ollama']

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
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Model</span>
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void handleSaveActive()}
              disabled={isSavingActive}
              className="h-10 rounded-lg bg-rose-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 disabled:opacity-50"
            >
              {isSavingActive ? 'Saving…' : 'Save'}
            </button>
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

      {/* ── Status / Error ── */}
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
