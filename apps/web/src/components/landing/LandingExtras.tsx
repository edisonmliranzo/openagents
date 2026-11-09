'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Lock, Mic, PhoneOff, Sparkles, Users, Video } from 'lucide-react'

const PRESETS = ['nova', 'atlas', 'ember', 'sage'] as const

const FEATURES = [
  { icon: Video, title: 'Realistic avatar calls', desc: 'Lifelike portrait avatars with lip-sync and expressions on live voice calls.' },
  { icon: Mic, title: 'Any voice provider', desc: 'Browser voices, ElevenLabs, OpenAI, Deepgram and more — swap anytime.' },
  { icon: Sparkles, title: 'Bring your own key', desc: 'Use APIsRouter or 15+ LLM providers. You pay providers directly, no markup.' },
  { icon: Lock, title: 'Private by default', desc: 'Keys encrypted at rest, data deletable on demand, self-host if you prefer.' },
  { icon: Users, title: 'Channels & teams', desc: 'Reach your agent on WhatsApp, email and the web; share with your team.' },
  { icon: Check, title: 'Approvals & tasks', desc: 'Autonomous tasks that ask before doing anything sensitive.' },
]

const PLANS = [
  { name: 'Free', price: '$0', period: 'forever', tagline: 'Bring your own key', features: ['Unlimited chat with your key', 'Voice calls & 1 avatar', 'Basic storage', 'Community support'], cta: 'Start free', href: '/register', highlight: false },
  { name: 'Pro', price: '$12', period: '/mo', tagline: 'For power users', features: ['Everything in Free', 'More storage', 'More avatars', 'Priority processing & support'], cta: 'Go Pro', href: '/register?plan=pro', highlight: true },
  { name: 'Team', price: '$29', period: '/seat/mo', tagline: 'For small teams', features: ['Everything in Pro', 'Shared workspaces', 'Team approvals & audit', 'Admin controls'], cta: 'Start team', href: '/register?plan=team', highlight: false },
]

const FAQS = [
  { q: 'What does BYOK cost me?', a: 'OpenAgents is free with your own API key. You pay your LLM/voice provider directly at their rates — typically cents per conversation. Pro and Team add storage, avatars and priority, not token markups.' },
  { q: 'Is my data private and encrypted?', a: 'API keys are encrypted at rest and never shown back in full. Conversations travel over TLS and are only used to serve you. You can also self-host the entire stack.' },
  { q: 'Which voice providers are supported?', a: 'Built-in browser speech works out of the box. You can connect ElevenLabs, OpenAI TTS/Realtime, Deepgram and other providers from Voice Settings.' },
  { q: 'How do I delete my data?', a: 'You can delete conversations, memories and keys individually, or request full account deletion from Settings / Support. Deletion is permanent.' },
]

export function LandingExtras({ warmTheme }: { warmTheme: boolean }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [videoOk, setVideoOk] = useState(true)
  const card = warmTheme
    ? 'border-black/[0.07] bg-white/90 shadow-lg shadow-stone-900/5'
    : 'border-white/10 bg-white/[0.03]'
  const muted = warmTheme ? 'text-stone-600' : 'text-slate-400'

  return (
    <>
      <style>{`
        @keyframes oaCallPulse { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.12); opacity: 0 } }
        @keyframes oaWave { 0%,100% { transform: scaleY(.3) } 50% { transform: scaleY(1) } }
        .oa-call-ring { animation: oaCallPulse 2.2s ease-in-out infinite }
        .oa-wave-bar { animation: oaWave 1s ease-in-out infinite; transform-origin: bottom }
      `}</style>

      {/* ── HERO DEMO: REALISTIC AVATAR CALL ── */}
      <section id="avatar-call-demo" className="mt-24 scroll-mt-20">
        <div className={`rounded-[32px] border p-6 sm:p-10 ${card}`}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-500">Live demo</span>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Call your AI like you call a friend</h3>
              <p className={`mt-3 text-xs leading-relaxed sm:text-sm ${muted}`}>
                Pick a realistic avatar, press call, and talk. It listens, thinks with your own model, and answers out loud — with a face.
              </p>
              <Link href="/register" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
                <Mic className="h-4 w-4" /> Try a voice call free
              </Link>
            </div>
            <div className="lg:col-span-7">
              <div className="relative mx-auto aspect-[16/10] w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f1424] via-[#0b101d] to-[#130d1e] text-white shadow-2xl">
                {videoOk && (
                  <video
                    src="/demo/avatar-call.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    onError={() => setVideoOk(false)}
                    className="absolute inset-0 z-10 h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
                  <div className="relative h-28 w-28 sm:h-36 sm:w-36">
                    <span className="oa-call-ring absolute inset-0 rounded-full border-2 border-rose-400" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/avatars/presets/nova.jpg" alt="Nova avatar on a call" className="relative h-full w-full rounded-full object-cover ring-4 ring-white/10" />
                  </div>
                  <div className="flex h-6 items-end gap-1">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} className="oa-wave-bar w-1 rounded-full bg-rose-400" style={{ height: '100%', animationDelay: `${(i % 6) * 0.12}s` }} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-300">Nova • On call 00:42</p>
                </div>
                <div className="absolute right-3 top-3 hidden gap-2 sm:flex">
                  {PRESETS.slice(1).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={`/avatars/presets/${p}.jpg`} alt={`${p} avatar`} className="h-9 w-9 rounded-xl object-cover opacity-80 ring-1 ring-white/20" />
                  ))}
                </div>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><Mic className="h-4 w-4" /></span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500"><PhoneOff className="h-4 w-4" /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="mt-24 scroll-mt-20">
        <h3 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Features</h3>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className={`rounded-2xl border p-5 ${card}`}>
              <Icon className="h-5 w-5 text-rose-500" />
              <p className="mt-3 text-sm font-bold">{title}</p>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="mt-24 scroll-mt-20">
        <h3 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Simple pricing</h3>
        <p className={`mt-2 text-center text-sm ${muted}`}>Free forever with your own key. Upgrade for more room.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.name} className={`flex flex-col rounded-3xl border p-6 ${plan.highlight ? 'border-rose-500/60 ring-2 ring-rose-500/30' : ''} ${card}`}>
              <p className="text-sm font-bold">{plan.name}</p>
              <p className={`text-xs ${muted}`}>{plan.tagline}</p>
              <p className="mt-4 text-3xl font-extrabold">
                {plan.price}<span className={`text-sm font-medium ${muted}`}> {plan.period}</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-xs">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-500" />{f}</li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`mt-6 rounded-full px-4 py-2 text-center text-sm font-semibold ${plan.highlight ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white' : warmTheme ? 'border border-stone-300' : 'border border-white/20'}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto mt-24 max-w-3xl scroll-mt-20">
        <h3 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">FAQ</h3>
        <div className="mt-8 space-y-3">
          {FAQS.map((item, i) => {
            const open = openFaq === i
            return (
              <div key={item.q} className={`rounded-2xl border ${card}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold"
                >
                  {item.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && <p className={`px-5 pb-4 text-xs leading-relaxed sm:text-sm ${muted}`}>{item.a}</p>}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
