import Link from 'next/link'
import type { Tournament } from '@/lib/types'
import type { StarHistogram, TournamentArchiveStats } from '@/lib/aggregateStats'
import { DarkStatCard } from '@/components/stats/DarkStatCard'

type Props = {
  tournament: Tournament
  stats: TournamentArchiveStats
}

function Histogram({ h }: { h: StarHistogram }) {
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((k) => h[k as keyof StarHistogram]))
  return (
    <div className="space-y-2">
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const c = h[star]
        const w = Math.round((c / max) * 100)
        return (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-8 font-mono font-bold text-[var(--lime)]">{star}★</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full border border-[var(--ink)]/30 bg-[var(--court)]">
              <div
                className="h-full rounded-full bg-[var(--lime)]/90"
                style={{ width: `${w}%` }}
              />
            </div>
            <span className="w-6 text-right font-mono text-[var(--cream)]/80">{c}</span>
          </div>
        )
      })}
    </div>
  )
}

export function TournamentStatsBlock({ tournament, stats }: Props) {
  if (tournament.status !== 'archived') {
    return (
      <div className="mb-8 rounded-3xl border-2 border-dashed border-[var(--ink)] bg-[var(--court)]/20 px-5 py-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-black text-[var(--ink)]">
          📊 Статистика по турниру
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ink-muted)]">
          Будет доступна после завершения турнира (когда он попадёт в архив).
        </p>
      </div>
    )
  }

  return (
    <div className="mb-10 space-y-6">
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
        <span>📊</span> Статистика турнира
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DarkStatCard emoji="👥" label="Участников">
          {stats.participantCount}
        </DarkStatCard>
        <DarkStatCard emoji="🎾" label="Матчей (всего)">
          {stats.matchCount}
        </DarkStatCard>
        <DarkStatCard emoji="✓" label="Завершено матчей">
          {stats.completedMatchCount}
        </DarkStatCard>
        <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--court)] p-4 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)]">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--cream)]/80">
            🌟 Самый FUN
          </p>
          {stats.topFunPlayer ? (
            <Link
              href={`/player/${stats.topFunPlayer.id}`}
              className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-black text-[var(--lime)] hover:underline"
            >
              <span>{stats.topFunPlayer.avatar_emoji}</span>
              <span>
                {stats.topFunPlayer.name}
                <span className="ml-1 font-mono text-base text-[var(--cream)]/90">
                  {stats.topFunPlayer.funSum}★
                </span>
              </span>
            </Link>
          ) : (
            <span className="text-sm text-[var(--cream)]/70">—</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border-2 border-[var(--ink)] bg-[var(--court-deep)] p-5 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)]">
          <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg font-black text-[var(--lime)]">
            🏅 Самый результативный
          </h3>
          <p className="mb-2 text-xs text-[var(--cream)]/65">
            По очкам турнирной системы (3 за победу, 1 за ничью в матче).
          </p>
          {stats.topPointsPlayer ? (
            <Link
              href={`/player/${stats.topPointsPlayer.id}`}
              className="flex flex-wrap items-center gap-2 text-lg font-bold hover:underline"
            >
              <span className="text-2xl">{stats.topPointsPlayer.avatar_emoji}</span>
              <span>
                {stats.topPointsPlayer.name}
                <span className="ml-2 font-mono text-[var(--lime)]">
                  {stats.topPointsPlayer.points} очк.
                </span>
                <span className="ml-2 text-sm text-[var(--cream)]/75">
                  {stats.topPointsPlayer.wins} п · {stats.topPointsPlayer.played} иг
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm">Нет завершённых матчей.</p>
          )}
        </div>

        <div className="rounded-3xl border-2 border-[var(--ink)] bg-[var(--court-deep)] p-5 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)]">
          <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg font-black text-[var(--lime)]">
            ⭐ Оценки FUN по матчам
          </h3>
          <p className="mb-3 text-xs text-[var(--cream)]/65">
            Каждая выставленная оценка стороны (A и B) отдельно, только завершённые матчи.
          </p>
          <Histogram h={stats.starHistogram} />
        </div>
      </div>
    </div>
  )
}
