import Link from 'next/link'
import type { TournamentFunRank } from '@/lib/aggregateStats'
import type { Player } from '@/lib/types'
import { DarkStatCard } from '@/components/stats/DarkStatCard'

type FunRow = Player & { funSum: number; funCount: number }

type Props = {
  clusterName: string
  allClusters: boolean
  completedMatchCount: number
  tournamentCount: number
  topFunPlayer: FunRow | null
  top3Tournaments: TournamentFunRank[]
}

function formatDate(d: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(d))
  } catch {
    return d
  }
}

export function ClusterStatsBlock({
  clusterName,
  allClusters,
  completedMatchCount,
  tournamentCount,
  topFunPlayer,
  top3Tournaments,
}: Props) {
  return (
    <section className="mb-16">
      <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
        <span>📈</span>{' '}
        {allClusters ? 'Статистика · все кластеры' : `Статистика кластера «${clusterName}»`}
      </h2>
      <p className="mb-6 text-sm font-semibold text-[var(--ink-muted)]">
        Завершённые матчи, турниры и FUN в выбранном масштабе навигации 🏠 Кластер.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DarkStatCard emoji="🎾" label="Матчей (завершено)">
          {completedMatchCount}
        </DarkStatCard>
        <DarkStatCard emoji="🏆" label="Турниров (всего)">
          {tournamentCount}
        </DarkStatCard>
        <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--court)] p-4 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)] sm:col-span-2">
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--cream)]/80">
            <span className="text-lg">🌟</span>
            Самый FUN-игрок
          </p>
          {topFunPlayer ? (
            <Link
              href={`/player/${topFunPlayer.id}`}
              className="group flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-black text-[var(--lime)] transition hover:underline sm:text-2xl"
            >
              <span className="text-3xl">{topFunPlayer.avatar_emoji}</span>
              <span>
                {topFunPlayer.name}
                <span className="ml-2 font-mono text-lg text-[var(--cream)]/90">
                  {topFunPlayer.funSum}★
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm font-bold text-[var(--cream)]/70">
              Пока нет оценок FUN.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border-2 border-[var(--ink)] bg-[var(--court-deep)] p-5 shadow-[6px_6px_0_var(--ink)] sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-black text-[var(--lime)]">
          <span>🎪</span> Топ-3 турнира по веселью
        </h3>
        <p className="mb-4 text-xs font-semibold text-[var(--cream)]/70">
          Сортируем по общей сумме звёзд FUN (оценка стороны A + оценка стороны B) в завершённых
          матчах; в скобках — средняя на матч.
        </p>
        {top3Tournaments.length === 0 ? (
          <p className="text-sm text-[var(--cream)]/70">
            Пока нет FUN-оценок в завершённых матчах — топ появится позже.
          </p>
        ) : (
          <ol className="space-y-3">
            {top3Tournaments.map((r, i) => (
              <li
                key={r.tournament.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--ink)]/40 bg-[var(--court)]/60 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-lg font-black text-[var(--lime)]">
                    {i + 1}.
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/tournament/${r.tournament.id}`}
                      className="block font-bold text-[var(--cream)] transition hover:text-[var(--lime)]"
                    >
                      {r.tournament.name}
                    </Link>
                    <p className="text-xs text-[var(--cream)]/60">
                      📅 {formatDate(r.tournament.scheduled_date)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-mono font-black text-[var(--lime)]">
                    {r.totalFun}★ всего
                  </p>
                  <p className="text-xs text-[var(--cream)]/60">
                    ~{r.avgPerMatch.toFixed(1)}★ / матч
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
