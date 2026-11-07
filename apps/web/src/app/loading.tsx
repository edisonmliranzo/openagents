export default function GlobalLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-screen flex-col items-center justify-center bg-[#090b12] px-4 text-white"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-lg">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tracking-wide text-white">Loading OpenAgents…</p>
          <p className="mt-1 text-xs text-slate-400">Preparing your personal AI agent workspace</p>
        </div>
      </div>
    </div>
  )
}
