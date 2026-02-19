'use client'

interface BadgeProps {
  count: number
  className?: string
}

export function Badge({ count, className = '' }: BadgeProps) {
  if (count <= 0) return null
  return (
    <span
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
