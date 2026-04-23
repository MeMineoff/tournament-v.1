'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { Group } from '@/lib/types'
import {
  CLUSTER_COOKIE_MAX_AGE,
  CLUSTER_COOKIE_NAME,
  CLUSTER_COOKIE_VALUE_ALL,
  type ClusterSelection,
} from '@/lib/cluster'

type Props = {
  groups: Group[]
  value: ClusterSelection
  variant?: 'nav' | 'corner'
  className?: string
}

export function GroupClusterSelect({
  groups,
  value,
  variant = 'nav',
  className = '',
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(next: ClusterSelection) {
    const cookieVal =
      next === 'all' ? CLUSTER_COOKIE_VALUE_ALL : String(next)
    document.cookie = `${CLUSTER_COOKIE_NAME}=${cookieVal}; path=/; max-age=${CLUSTER_COOKIE_MAX_AGE}; SameSite=Lax`
    startTransition(() => router.refresh())
  }

  const isCorner = variant === 'corner'

  return (
    <label
      className={`flex min-w-0 flex-col gap-1 ${
        isCorner
          ? 'w-[min(100vw-2rem,260px)] sm:w-[280px]'
          : 'max-w-[min(100%,280px)] sm:min-w-[200px]'
      } ${className}`}
    >
      <span
        className={`font-black uppercase tracking-wider text-[var(--cream)] ${
          isCorner ? 'text-[9px]' : 'text-[10px]'
        } opacity-90`}
      >
        🏠 Кластер
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base">
          🏠
        </span>
        <select
          value={value === 'all' ? CLUSTER_COOKIE_VALUE_ALL : String(value)}
          disabled={pending || groups.length === 0}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === CLUSTER_COOKIE_VALUE_ALL ? 'all' : Number(v))
          }}
          className="w-full cursor-pointer appearance-none rounded-xl border-2 border-[var(--ink)] bg-[var(--court-deep)] py-2.5 pl-10 pr-8 text-sm font-bold text-[var(--cream)] shadow-[2px_2px_0_var(--ink)] outline-none transition focus:ring-2 focus:ring-[var(--lime)] disabled:opacity-60"
          aria-label="Выбор кластера"
        >
          <option
            value={CLUSTER_COOKIE_VALUE_ALL}
            className="bg-[var(--court-deep)] text-[var(--cream)]"
          >
            Общее — все кластеры
          </option>
          {groups.map((g) => (
            <option
              key={g.id}
              value={g.id}
              className="bg-[var(--court-deep)] text-[var(--cream)]"
            >
              {g.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cream)]/80">
          ▼
        </span>
      </div>
    </label>
  )
}
