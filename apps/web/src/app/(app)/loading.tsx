export default function AppWorkspaceLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-6xl space-y-6 p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
          <div className="h-4 w-80 animate-pulse rounded-lg bg-slate-200/60 dark:bg-slate-800/60" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-2xl border border-slate-200/70 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/50"
          />
        ))}
      </div>

      <div className="h-96 animate-pulse rounded-2xl border border-slate-200/70 bg-white/60 p-6 dark:border-slate-800 dark:bg-slate-900/50" />
      <span className="sr-only">Loading workspace view…</span>
    </div>
  )
}
