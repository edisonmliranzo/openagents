'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'

interface SkillTool {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
}

function categoryForTool(toolName: string) {
  if (toolName.startsWith('gmail_')) return 'email'
  if (toolName.startsWith('calendar_')) return 'calendar'
  if (toolName.startsWith('web_')) return 'web'
  if (toolName.startsWith('notes_')) return 'notes'
  return 'custom'
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillTool[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const tools = await sdk.tools.list()
      setSkills(tools)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load skills')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Skills</h1>
          <p className="mt-1 text-sm text-slate-500">Registered tool skills exposed to the agent planner.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSkills()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Tool Skills</h2>
        <p className="mt-1 text-sm text-slate-500">{skills.length} skills currently available.</p>

        <div className="mt-4 space-y-3">
          {skills.length === 0 && <p className="text-sm text-slate-500">{isLoading ? 'Loading skills...' : 'No skills found.'}</p>}
          {skills.map((skill) => (
            <details key={skill.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{skill.displayName}</p>
                    <p className="mt-1 text-xs text-slate-500">{skill.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{skill.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {categoryForTool(skill.name)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        skill.requiresApproval
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {skill.requiresApproval ? 'approval' : 'direct'}
                    </span>
                  </div>
                </div>
              </summary>
              <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(skill.inputSchema, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
