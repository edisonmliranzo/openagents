export default function AuthLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[#090b12] p-6 text-white"
    >
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-white/10" />
        <div className="h-4 w-64 animate-pulse rounded-lg bg-white/5" />
        <div className="space-y-3 pt-4">
          <div className="h-11 w-full animate-pulse rounded-xl bg-white/10" />
          <div className="h-11 w-full animate-pulse rounded-xl bg-white/10" />
          <div className="h-11 w-full animate-pulse rounded-xl bg-rose-500/30" />
        </div>
        <span className="sr-only">Loading authentication screen…</span>
      </div>
    </div>
  )
}
