'use client'

import { Check, Circle, ListChecks, LoaderCircle } from 'lucide-react'
import clsx from 'clsx'

export function PlanChecklist({
  plan,
  onDismiss,
}: {
  plan: { steps: string[]; done: number; total: number }
  onDismiss: () => void
}) {
  const complete = plan.done >= plan.total
  return (
    <div className="oa-float-card mx-auto w-full max-w-[980px] !rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
          <ListChecks size={14} className="text-[var(--accent-strong)]" />
          Working through the plan
          <span className="font-normal text-slate-400">
            {plan.done}/{plan.total}
          </span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
        >
          Hide
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {plan.steps.map((step, i) => {
          const done = i < plan.done
          const current = i === plan.done && !complete
          return (
            <div key={`${step}-${i}`} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <Check size={14} className="text-emerald-500" />
                ) : current ? (
                  <LoaderCircle size={14} className="animate-spin text-orange-500" />
                ) : (
                  <Circle size={14} className="text-slate-300 dark:text-slate-600" />
                )}
              </span>
              <span
                className={clsx(
                  'text-[12px] leading-snug',
                  done
                    ? 'text-slate-400 line-through'
                    : current
                      ? 'font-medium text-slate-800 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
