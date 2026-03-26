'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { NanobotSkillChatMessage, NanobotSkillDraftInput, NanobotSkillState, SkillReputationEntry } from '@openagents/shared'

function badgeClass(entry: SkillReputationEntry) {
  if (entry.badge === 'trusted') return 'bg-emerald-100 text-emerald-700'
  if (entry.badge === 'stable') return 'bg-cyan-100 text-cyan-700'
  return 'bg-amber-100 text-amber-700'
}

export default function SkillsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [skills, setSkills] = useState<NanobotSkillState[]>([])
  const [reputation, setReputation] = useState<SkillReputationEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [composerInput, setComposerInput] = useState('')
  const [composerMessages, setComposerMessages] = useState<NanobotSkillChatMessage[]>([])
  const [draft, setDraft] = useState<NanobotSkillDraftInput | null>(null)
  const [error, setError] = useState('')

  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [skills, reputation] = await Promise.all([
        sdk.nanobot.listSkills(),
        sdk.skillReputation.list(),
      ])
      setSkills(skills)
      setReputation(reputation)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load skills'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  async function handleToggle(skill: NanobotSkillState) {
    setIsMutating(true)
    setError('')
    try {
      const next = skill.enabled
        ? await sdk.nanobot.disableSkill(skill.id)
        : await sdk.nanobot.enableSkill(skill.id)
      setSkills(next)
      const latestReputation = await sdk.skillReputation.list()
      setReputation(latestReputation)
      addToast('success', `${skill.enabled ? 'Disabled' : 'Enabled'} ${skill.title}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to toggle skill'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  async function handleComposeSkill() {
    const prompt = composerInput.trim()
    if (!prompt) {
      addToast('warning', 'Enter a skill prompt first.')
      return
    }

    setIsComposing(true)
    setError('')
    const nextMessages: NanobotSkillChatMessage[] = [
      ...composerMessages,
      { role: 'user', content: prompt },
    ]
    setComposerMessages(nextMessages)
    setComposerInput('')

    try {
      const result = await sdk.nanobot.chatSkillBuilder({
        messages: nextMessages,
      })
      setDraft(result.draft)
      setComposerMessages([
        ...nextMessages,
        { role: 'assistant', content: result.assistantMessage },
      ])
      addToast('success', `Drafted "${result.draft.title}" via ${result.llmProvider}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to generate skill draft'
      setError(message)
      addToast('error', message)
    } finally {
      setIsComposing(false)
    }
  }

  async function handleSaveDraft() {
    if (!draft) {
      addToast('warning', 'Generate a draft before saving.')
      return
    }

    setIsSavingDraft(true)
    setError('')
    try {
      const result = await sdk.nanobot.chatSkillBuilder({
        save: true,
        draft,
      })
      setDraft(result.draft)
      setSkills(result.skills ?? await sdk.nanobot.listSkills())
      const latestReputation = await sdk.skillReputation.list()
      setReputation(latestReputation)
      setComposerMessages((current) => [
        ...current,
        { role: 'assistant', content: result.assistantMessage },
      ])
      addToast('success', result.assistantMessage)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save skill draft'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingDraft(false)
    }
  }

  function handleClearComposer() {
    setComposerInput('')
    setComposerMessages([])
    setDraft(null)
    setError('')
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Skills</h1>
          <p className="mt-1 text-sm text-slate-500">Installed skill reliability, trust badges, and health signals.</p>
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Skill Chat Builder</h2>
            <p className="mt-1 text-sm text-slate-500">Describe a workflow in plain language and generate a reusable skill draft.</p>
          </div>
          <button
            type="button"
            onClick={handleClearComposer}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear chat
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {composerMessages.length === 0 && (
                <p className="text-xs text-slate-500">
                  Example prompt: Create a bug triage skill that searches issues, fetches logs, and summarizes next actions.
                </p>
              )}
              {composerMessages.map((message, idx) => (
                <div
                  key={`${message.role}-${idx}`}
                  className={`max-w-[95%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    message.role === 'user'
                      ? 'ml-auto bg-slate-900 text-slate-100'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>

            <textarea
              value={composerInput}
              onChange={(event) => setComposerInput(event.target.value)}
              placeholder="Describe the skill you want to create..."
              className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleComposeSkill()}
                disabled={isComposing}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {isComposing ? 'Generating...' : 'Generate Draft'}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={isSavingDraft || !draft}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {isSavingDraft ? 'Saving...' : 'Save Skill'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft Preview</p>
            {!draft && <p className="mt-2 text-sm text-slate-500">No draft generated yet.</p>}
            {draft && (
              <div className="mt-2 space-y-2 text-xs text-slate-700">
                <div>
                  <p className="font-semibold text-slate-800">{draft.title}</p>
                  {draft.id && <p className="mt-1 font-mono text-[11px] text-slate-500">{draft.id}</p>}
                </div>
                <p>{draft.description}</p>
                <div>
                  <p className="font-semibold text-slate-800">Tools</p>
                  <p className="mt-1">{draft.tools.join(', ')}</p>
                </div>
                {draft.promptAppendix && (
                  <div>
                    <p className="font-semibold text-slate-800">Prompt Guidance</p>
                    <p className="mt-1 whitespace-pre-wrap">{draft.promptAppendix}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Installed Skills</h2>
        <p className="mt-1 text-sm text-slate-500">{skills.length} skills currently available.</p>

        <div className="mt-4 space-y-3">
          {skills.length === 0 && <p className="text-sm text-slate-500">{isLoading ? 'Loading skills...' : 'No skills found.'}</p>}
          {skills.map((skill) => (
            <details key={skill.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{skill.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{skill.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{skill.id}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {(() => {
                      const entry = reputation.find((item) => item.skillId === skill.id)
                      if (!entry) return null
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(entry)}`}>
                          {entry.badge}
                        </span>
                      )
                    })()}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        skill.enabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {skill.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                </div>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-800">Tools</p>
                  <p className="mt-1">{skill.tools.length > 0 ? skill.tools.join(', ') : 'none'}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-800">Reputation</p>
                  {(() => {
                    const entry = reputation.find((item) => item.skillId === skill.id)
                    if (!entry) return <p className="mt-1">No run history yet.</p>
                    return (
                      <div className="mt-1 space-y-1">
                        <p>score: {entry.score}</p>
                        <p>success rate: {entry.successRate}%</p>
                        <p>7d success: {entry.sevenDaySuccessRate}%</p>
                        <p>runs: {entry.totalRuns} (failed: {entry.failedRuns})</p>
                        <p>last failure: {entry.lastFailureAt ? new Date(entry.lastFailureAt).toLocaleString() : 'none'}</p>
                      </div>
                    )
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleToggle(skill)}
                disabled={isMutating}
                className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  skill.enabled
                    ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {skill.enabled ? 'Disable skill' : 'Enable skill'}
              </button>
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
