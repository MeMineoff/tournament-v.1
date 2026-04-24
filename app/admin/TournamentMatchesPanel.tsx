'use client'

import Link from 'next/link'
import type { Tournament } from '@/lib/types'

type Props = {
  tournaments: Tournament[]
}

export function TournamentMatchesPanel({ tournaments }: Props) {
  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
        Матчи и состав турниров ⚡
      </h2>
      <p className="mb-4 text-sm text-[var(--ink-muted)]">
        Назначение игроков на матчи, добавление матчей круга и правка{' '}
        <code className="rounded bg-[var(--cream)] px-1">participant_ids</code> перенесены на
        страницу турнира. Откройте нужный турнир:
      </p>
      {tournaments.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">Турниров пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
            >
              <div>
                <span className="font-bold">{t.name}</span>
                <span className="ml-2 text-xs text-[var(--ink-muted)]">
                  {t.format} · id {t.id}
                </span>
              </div>
              <Link
                href={`/admin/tournament/${t.id}`}
                className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
              >
                Редактировать матчи →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
