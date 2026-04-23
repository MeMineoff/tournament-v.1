'use client'

type Props = {
  label: string
  value: number | null
  onChange: (n: number) => void
  accent?: string
  disabled?: boolean
}

export function StarRow({
  label,
  value,
  onChange,
  accent = 'var(--clay)',
  disabled = false,
}: Props) {
  return (
    <div className={`space-y-2 ${disabled ? 'opacity-50' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value != null && n <= value
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className="touch-manipulation rounded-md border-2 border-[var(--ink)] px-2 py-1 text-lg transition hover:scale-105 active:scale-95 disabled:pointer-events-none"
              style={{
                background: active ? accent : 'var(--surface-2)',
                boxShadow: active ? '2px 2px 0 var(--ink)' : 'none',
              }}
              aria-label={`${n} из 5`}
            >
              {active ? '⭐' : '☆'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
