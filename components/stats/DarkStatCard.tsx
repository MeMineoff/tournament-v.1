import type { ReactNode } from 'react'

type Props = {
  emoji: string
  label: string
  children: ReactNode
  className?: string
}

export function DarkStatCard({ emoji, label, children, className = '' }: Props) {
  return (
    <div
      className={`rounded-2xl border-2 border-[var(--ink)] bg-[var(--court)] p-4 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)] ${className}`}
    >
      <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--cream)]/80">
        <span className="text-lg leading-none">{emoji}</span>
        {label}
      </p>
      <div className="font-[family-name:var(--font-display)] text-2xl font-black leading-tight text-[var(--lime)] sm:text-3xl">
        {children}
      </div>
    </div>
  )
}
