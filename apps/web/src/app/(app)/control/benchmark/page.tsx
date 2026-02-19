'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { OllamaBenchmarkResult } from '@openagents/shared'

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
  const [rounds, setRounds] = useState(1)
  const [result, setResult] = useState<OllamaBenchmarkResult | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')

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
    void loadModels(DEFAULT_OLLAMA_BASE_URL)
  }, [loadModels])

  const toggleModel = useCallback((model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((entry) => entry !== model)
        : [...prev, model],
    )
  }, [])

  const runBenchmark = useCallback(async () => {
    setIsRunning(true)
    setError('')
    try {
      const response = await sdk.system.benchmarkOllama({
        baseUrl,
        models: selectedModels.length > 0 ? selectedModels : undefined,
        rounds,
      })
      setResult(response)
    } catch (err: any) {
      setError(err?.message ?? 'Benchmark run failed')
    } finally {
      setIsRunning(false)
    }
  }, [baseUrl, selectedModels, rounds])

  const topModel = useMemo(() => {
    if (!result?.models.length) return null
    return result.models[0]
  }, [result])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Ollama Benchmark</h1>
          <p className="mt-1 text-sm text-slate-500">Quality and latency comparison across local Ollama models.</p>
        </div>
        <button
          type="button"
          onClick={() => void runBenchmark()}
          disabled={isRunning || isLoadingModels}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run benchmark'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
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
              <option value={1}>1 round (quick)</option>
              <option value={2}>2 rounds</option>
              <option value={3}>3 rounds (more stable)</option>
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
          <p className="text-xs text-slate-500">
            {models.length > 0
              ? `${models.length} model${models.length === 1 ? '' : 's'} detected`
              : 'No local models detected'}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Models</h2>
        <p className="mt-1 text-sm text-slate-500">Choose specific models, or leave all unchecked to benchmark every detected model.</p>

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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Top Score</p>
              <p className="mt-2 truncate text-xl font-semibold text-slate-900">{topModel?.model ?? '-'}</p>
              <p className="mt-1 text-xs text-slate-500">Avg score {formatScore(topModel?.avgScore ?? 0)}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Base URL</p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-900">{result.baseUrl}</p>
              <p className="mt-1 text-xs text-slate-500">Generated {new Date(result.generatedAt).toLocaleString()}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Benchmarked</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{result.models.length}</p>
              <p className="mt-1 text-xs text-slate-500">models</p>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Model Ranking</h2>
            <p className="mt-1 text-sm text-slate-500">Sorted by score, then latency.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-2">Model</th>
                    <th className="pb-2">Avg Score</th>
                    <th className="pb-2">Pass Rate</th>
                    <th className="pb-2">Avg Latency</th>
                    <th className="pb-2">P95 Latency</th>
                    <th className="pb-2">Errors</th>
                    <th className="pb-2">Rounds</th>
                  </tr>
                </thead>
                <tbody>
                  {result.models.map((model) => (
                    <tr key={model.model} className="border-t border-slate-100 text-slate-700">
                      <td className="py-2 font-mono text-xs font-semibold">{model.model}</td>
                      <td className="py-2">{formatScore(model.avgScore)}</td>
                      <td className="py-2">{formatPercent(model.passRate)}</td>
                      <td className="py-2">{formatMs(model.avgLatencyMs)}</td>
                      <td className="py-2">{formatMs(model.p95LatencyMs)}</td>
                      <td className="py-2">{model.errors}</td>
                      <td className="py-2">{model.rounds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Prompt Breakdown</h2>
            <p className="mt-1 text-sm text-slate-500">Per-prompt quality and latency for each model.</p>

            <div className="mt-4 space-y-3">
              {result.models.map((model) => (
                <details key={`details-${model.model}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3" open>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                    {model.model}
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="pb-2">Prompt</th>
                          <th className="pb-2">Score</th>
                          <th className="pb-2">Latency</th>
                          <th className="pb-2">Passed</th>
                          <th className="pb-2">Sample</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.prompts.map((prompt) => (
                          <tr key={`${model.model}-${prompt.promptId}`} className="border-t border-slate-200 text-slate-700">
                            <td className="py-2 font-mono text-xs">{prompt.promptId}</td>
                            <td className="py-2">{formatScore(prompt.score)}</td>
                            <td className="py-2">{formatMs(prompt.latencyMs)}</td>
                            <td className="py-2">{prompt.passed ? 'yes' : 'no'}</td>
                            <td className="py-2 text-xs text-slate-600">
                              {prompt.error ? `Error: ${prompt.error}` : prompt.responseSample || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
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
