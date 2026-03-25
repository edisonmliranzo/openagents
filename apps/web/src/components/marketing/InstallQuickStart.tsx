'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Play, RefreshCcw } from 'lucide-react'
import {
  OPENAGENTS_INSTALL_GIT_REF,
  OPENAGENTS_LOCAL_QUICK_START,
  getOpenAgentsInstallCommand,
  type OpenAgentsLocalQuickStartPlatform,
} from '@openagents/shared'

type Platform = OpenAgentsLocalQuickStartPlatform

interface InstallQuickStartProps {
  theme?: 'dark' | 'light'
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') {
    return 'windows'
  }

  const userAgent = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  if (userAgent.includes('mac')) {
    return 'macos'
  }
  if (userAgent.includes('linux') || userAgent.includes('ubuntu')) {
    return 'ubuntu'
  }
  return 'windows'
}

export default function InstallQuickStart({ theme = 'dark' }: InstallQuickStartProps) {
  const [platform, setPlatform] = useState<Platform>('windows')
  const [siteOrigin, setSiteOrigin] = useState('')
  const [copiedKey, setCopiedKey] = useState<'install' | 'start' | null>(null)

  useEffect(() => {
    setPlatform(detectPlatform())
    if (typeof window !== 'undefined') {
      setSiteOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    if (!copiedKey) {
      return
    }

    const timeout = window.setTimeout(() => setCopiedKey(null), 1600)
    return () => window.clearTimeout(timeout)
  }, [copiedKey])

  const installGitRef = process.env.NEXT_PUBLIC_INSTALL_GIT_REF || OPENAGENTS_INSTALL_GIT_REF
  const activeQuickStart = useMemo(() => OPENAGENTS_LOCAL_QUICK_START[platform], [platform])
  const installCommand = useMemo(
    () => getOpenAgentsInstallCommand(platform, siteOrigin || undefined, installGitRef),
    [installGitRef, platform, siteOrigin],
  )
  const usingPreviewRef = installGitRef !== OPENAGENTS_INSTALL_GIT_REF

  const shellSurfaceClass =
    theme === 'dark'
      ? 'rounded-2xl border border-white/10 bg-slate-950/50 p-4'
      : 'rounded-2xl border border-slate-200 bg-slate-900 p-4'
  const shellLabelClass =
    theme === 'dark'
      ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400'
      : 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300'
  const shellBodyClass = 'text-slate-100'
  const shellDescriptionClass = 'text-slate-300'
  const textMutedClass = theme === 'dark' ? 'text-slate-300' : 'text-slate-500'
  const borderClass = theme === 'dark' ? 'border-white/10' : 'border-slate-200'
  const pillActiveClass =
    theme === 'dark'
      ? 'border border-rose-300/50 bg-rose-500/20 text-rose-100'
      : 'border border-red-300 bg-red-50 text-red-700'
  const pillIdleClass =
    theme === 'dark'
      ? 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  const infoSurfaceClass =
    theme === 'dark'
      ? 'rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4'
      : 'rounded-2xl border border-cyan-200 bg-cyan-50 p-4'
  const infoTitleClass =
    theme === 'dark'
      ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100'
      : 'text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700'
  const infoBodyClass = theme === 'dark' ? 'text-cyan-50' : 'text-cyan-950'
  const infoCardClass =
    theme === 'dark'
      ? 'rounded-xl border border-white/10 bg-white/5 p-4'
      : 'rounded-xl border border-cyan-200 bg-white p-4'
  const infoCardTitleClass =
    theme === 'dark'
      ? 'flex items-center gap-2 text-sm font-semibold text-white'
      : 'flex items-center gap-2 text-sm font-semibold text-slate-900'
  const manualPreClass =
    theme === 'dark'
      ? 'mt-4 overflow-x-auto rounded-xl bg-slate-950/50 p-4 text-sm text-slate-100'
      : 'mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100'
  const buttonClass =
    theme === 'dark'
      ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10'
      : 'inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'

  async function handleCopy(key: 'install' | 'start', text: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(OPENAGENTS_LOCAL_QUICK_START) as Platform[]).map((key) => {
          const active = key === platform
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPlatform(key)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? pillActiveClass : pillIdleClass}`}
            >
              {OPENAGENTS_LOCAL_QUICK_START[key].label}
            </button>
          )
        })}
      </div>

      <div className={`flex flex-wrap items-center gap-2 text-xs ${textMutedClass}`}>
        <span className={`rounded-full border px-3 py-1 ${borderClass}`}>
          {siteOrigin ? 'Installer served from this site' : 'Installer fallback: GitHub raw'}
        </span>
        <span className={`rounded-full border px-3 py-1 ${borderClass}`}>
          Re-run step 1 later to update OpenAgents
        </span>
      </div>

      {usingPreviewRef ? (
        <p className={`text-xs ${textMutedClass}`}>
          Preview build: this install command tracks git ref <code>{installGitRef}</code>.
        </p>
      ) : null}

      <div className={shellSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2">
          <div>
            <p className={shellLabelClass}>Step 1</p>
            <p className="mt-1 text-sm font-semibold text-white">Install OpenAgents</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy('install', installCommand)}
            className={buttonClass}
          >
            {copiedKey === 'install' ? <Check size={14} /> : <Copy size={14} />}
            {copiedKey === 'install' ? 'Copied' : 'Copy command'}
          </button>
        </div>

        <p className={`mt-3 text-sm ${shellDescriptionClass}`}>{activeQuickStart.installerNote}</p>
        <div className={`mt-4 overflow-x-auto text-sm ${shellBodyClass}`}>
          <div className="whitespace-pre">
            <span className="mr-2 text-cyan-300">{activeQuickStart.shellPrefix}</span>
            <code>{installCommand}</code>
          </div>
        </div>
      </div>

      <div className={infoSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={infoTitleClass}>Step 2</p>
            <p className={`mt-1 text-sm font-semibold ${infoBodyClass}`}>Start or reopen later</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy('start', activeQuickStart.startCommand)}
            className={buttonClass}
          >
            {copiedKey === 'start' ? <Check size={14} /> : <Copy size={14} />}
            {copiedKey === 'start' ? 'Copied' : 'Copy start'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className={infoCardClass}>
            <div className={infoCardTitleClass}>
              <Download size={14} />
              Start now
            </div>
            <div className={`mt-2 overflow-x-auto text-sm ${infoBodyClass}`}>
              <div className="whitespace-pre">
                <span className="mr-2 text-cyan-200">{activeQuickStart.shellPrefix}</span>
                <code>{activeQuickStart.startCommand}</code>
              </div>
            </div>
          </div>

          <div className={infoCardClass}>
            <div className={infoCardTitleClass}>
              <Play size={14} />
              Reopen later
            </div>
            <p className={`mt-2 text-sm ${infoBodyClass}`}>{activeQuickStart.launcherHint}</p>
            <div className={`mt-3 flex items-start gap-2 text-xs ${infoBodyClass}`}>
              <RefreshCcw size={13} className="mt-0.5 shrink-0" />
              <span>To update later, rerun the same install command from step 1.</span>
            </div>
          </div>
        </div>

        <p className={`mt-3 text-sm ${infoBodyClass}`}>
          Access example: {activeQuickStart.accessExample}
        </p>
      </div>

      <details
        className={`rounded-2xl border p-4 ${
          theme === 'dark'
            ? 'border-white/10 bg-slate-950/35'
            : 'border-slate-200 bg-slate-50'
        }`}
      >
        <summary className={`cursor-pointer text-sm font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
          Manual steps if the installer is blocked
        </summary>
        <pre className={manualPreClass}>
          {activeQuickStart.localCommands
            .map((line) => `${activeQuickStart.shellPrefix} ${line}`)
            .join('\n')}
        </pre>
      </details>
    </div>
  )
}
