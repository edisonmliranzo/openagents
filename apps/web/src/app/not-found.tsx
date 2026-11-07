import Link from 'next/link'
import { ArrowLeft, Compass, Home, MessageSquare, PhoneCall, Settings, Sparkles } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#090b12] px-4 py-16 text-white selection:bg-rose-500 selection:text-white">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-rose-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-violet-500/15 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="OpenAgents logo mark on 404 page"
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl object-contain"
          />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-rose-300">
          <Sparkles className="h-3.5 w-3.5" />
          Error 404 · Route Not Found
        </div>

        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          This agent route doesn&apos;t exist.
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
          The page you requested may have moved, been renamed, or doesn&apos;t exist. Jump back into your workspace, start a live voice call with your expressive avatar, or return to the homepage.
        </p>

        {/* Primary CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition hover:brightness-110"
          >
            <Home className="h-4 w-4" />
            <span>Back to Homepage</span>
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            <MessageSquare className="h-4 w-4 text-rose-400" />
            <span>Open Agent Chat</span>
          </Link>
        </div>

        {/* Helpful quick routes */}
        <div className="mt-10 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-4">
          <Link
            href="/phone"
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:border-rose-500/40 hover:bg-white/[0.06]"
          >
            <PhoneCall className="h-4 w-4 text-rose-400" />
            <div className="mt-2 text-xs font-bold text-white">Voice &amp; Avatar</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Live call studio</div>
          </Link>
          <Link
            href="/settings/config"
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:border-violet-500/40 hover:bg-white/[0.06]"
          >
            <Settings className="h-4 w-4 text-violet-400" />
            <div className="mt-2 text-xs font-bold text-white">AI Models &amp; Keys</div>
            <div className="mt-0.5 text-[11px] text-slate-400">APIsRouter &amp; BYOK</div>
          </Link>
          <Link
            href="/docs"
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:border-cyan-500/40 hover:bg-white/[0.06]"
          >
            <Compass className="h-4 w-4 text-cyan-400" />
            <div className="mt-2 text-xs font-bold text-white">Documentation</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Setup &amp; API guides</div>
          </Link>
          <Link
            href="/support"
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:border-emerald-500/40 hover:bg-white/[0.06]"
          >
            <ArrowLeft className="h-4 w-4 text-emerald-400" />
            <div className="mt-2 text-xs font-bold text-white">Help &amp; Support</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Diagnostics &amp; FAQ</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
