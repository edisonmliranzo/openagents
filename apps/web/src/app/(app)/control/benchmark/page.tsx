'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { PlatformEvalRunResult, PlatformEvalSuite } from '@openagents/shared'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'

function formatMs(value: number) {
  if (!Number.isFinite(value)) return '0 ms'
  return `${Math.round(value)} ms`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`
}

function formatScore(value: number) {
  if (!Number.isFinite(value)) return '0.0'
  return value.toFixed(1)
}

export default function BenchmarkPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL)
  const [models, setModels] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [suites, setSuites] = useState<PlatformEvalSuite[]>([])
  const [selectedSuiteId, setSelectedSuiteId] = useState('core-reasoning-v1')
  const [rounds, setRounds] = useState(1)
  const [result, setResult] = useState<PlatformEvalRunResult | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isLoadingSuites, setIsLoadingSuites] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')

  const loadSuites = useCallback(async () => {
    setIsLoadingSuites(true)
    setError('')
    try {
      const list = await sdk.platform.evalSuites()
      setSuites(list)
      setSelectedSuiteId((current) => current || list[0]?.id || '')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load eval suites')
    } finally {
      setIsLoadingSuites(false)
    }
  }, [])

  const loadModels = useCallback(async (targetBaseUrl: string) => {
    setIsLoadingModels(true)
    setError('')
    try {
      const list = await sdk.agent.listOllamaModels(targetBaseUrl)
      setModels(list.models)
      setSelectedModels((prev) => prev.filter((model) => list.models.includes(model)))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load local Ollama models')
    } finally {
      setIsLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([loadSuites(), loadModels(DEFAULT_OLLAMA_BASE_URL)])
  }, [loadSuites, loadModels])

  const toggleModel = useCallback((model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((entry) => entry !== model)
        : [...prev, model],
    )
  }, [])

  const runEval = useCallback(async () => {
    if (!selectedSuiteId) {
      setError('Select an eval suite first.')
      return
    }
    setIsRunning(true)
    setError('')
    try {
      const response = await sdk.platform.runEval({
        suiteId: selectedSuiteId,
        baseUrl,
        models: selectedModels.length > 0 ? selectedModels : undefined,
        rounds,
      })
      setResult(response)
    } catch (err: any) {
      setError(err?.message ?? 'Eval run failed')
    } finally {
      setIsRunning(false)
    }
  }, [selectedSuiteId, baseUrl, selectedModels, rounds])

  const topModel = useMemo(() => {
    if (!result?.models.length) return null
    return result.models[0]
  }, [result])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Built-in Eval Suite</h1>
          <p className="mt-1 text-sm text-slate-500">Run benchmark suites across selected local Ollama models.</p>
        </div>
        <button
          type="button"
          onClick={() => void runEval()}
          disabled={isRunning || isLoadingModels || isLoadingSuites}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run eval suite'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Suite</span>
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            >
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.title}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Ollama Base URL</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Rounds per prompt</span>
            <select
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value) || 1)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            >
              <option value={1}>1 round</option>
              <option value={2}>2 rounds</option>
              <option value={3}>3 rounds</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadModels(baseUrl)}
            disabled={isLoadingModels}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {isLoadingModels ? 'Loading models...' : 'Refresh models'}
          </button>
          <button
            type="button"
            onClick={() => void loadSuites()}
            disabled={isLoadingSuites}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {isLoadingSuites ? 'Loading suites...' : 'Refresh suites'}
          </button>
          <p className="text-xs text-slate-500">
            {models.length > 0
              ? `${models.length} model${models.length === 1 ? '' : 's'} detected`
              : 'No local models detected'}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Models</h2>
        <p className="mt-1 text-sm text-slate-500">Select models to run. Leave all unchecked to evaluate all detected models.</p>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => {
            const checked = selectedModels.includes(model)
            return (
              <label
                key={model}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  checked ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleModel(model)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="truncate font-mono text-xs">{model}</span>
              </label>
            )
          })}
          {models.length === 0 && <p className="text-sm text-slate-500">No models available.</p>}
        </div>
      </section>

      {result && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Top Model</p>
              <p className="mt-2 truncate text-xl font-semibold text-slate-900">{topModel?.model ?? '-'}</p>
              <p className="mt-1 text-xs text-slate-500">Avg score {formatScore(topModel?.avgScore ?? 0)}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Suite</p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-900">{result.suiteId}</p>
              <p className="mt-1 text-xs text-slate-500">Run {new Date(result.generatedAt).toLocaleString()}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Benchmarked</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{result.models.length}</p>
              <p className="mt-1 text-xs text-slate-500">models</p>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Ranking</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-2">Rank</th>
                    <th className="pb-2">Model</th>
                    <th className="pb-2">Avg Score</th>
                    <th className="pb-2">Pass Rate</th>
                    <th className="pb-2">Avg Latency</th>
                    <th className="pb-2">P95 Latency</th>
                    <th className="pb-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {result.models.map((model) => (
                    <tr key={model.model} className="border-t border-slate-100 text-slate-700">
                      <td className="py-2">{model.rank}</td>
                      <td className="py-2 font-mono text-xs font-semibold">{model.model}</td>
                      <td className="py-2">{formatScore(model.avgScore)}</td>
                      <td className="py-2">{formatPercent(model.passRate)}</td>
                      <td className="py-2">{formatMs(model.avgLatencyMs)}</td>
                      <td className="py-2">{formatMs(model.p95LatencyMs)}</td>
                      <td className="py-2">{model.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

