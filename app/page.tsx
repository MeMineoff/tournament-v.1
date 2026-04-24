import Link from 'next/link'
import { cookies } from 'next/headers'
import { getGroupsForNav } from '@/lib/cachedGroups'
import { normalizeParticipantIds } from '@/lib/participantIds'
import { supabase } from '@/lib/supabaseClient'
import type { Group, Match, Player, Tournament } from '@/lib/types'
import { computeClusterSummaryStats } from '@/lib/aggregateStats'
import { computeFunStarsSumLeaderboard } from '@/lib/stats'
import { CLUSTER_COOKIE_NAME, parseClusterSelection } from '@/lib/cluster'
import { HomeClusterCorner } from '@/components/HomeClusterCorner'
import { ClusterStatsBlock } from '@/components/stats/ClusterStatsBlock'
import { supabaseErrorMessage } from '@/lib/supabaseErrorMessage'

export const dynamic = 'force-dynamic'

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

function formatBadge(t: Tournament) {
  if (t.format === 'playoff') {
    return { label: 'Плей-офф', emoji: '🏆' }
  }
  return { label: 'Круг', emoji: '⭕' }
}

function normalizeTournament(row: Tournament & Record<string, unknown>): Tournament {
  return {
    ...row,
    playoff_bracket_size: row.playoff_bracket_size ?? null,
    participant_ids: normalizeParticipantIds(row.participant_ids),
  }
}

function normalizeMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as number,
    tournament_id: row.tournament_id as number,
    player_a_id: (row.player_a_id as number | null | undefined) ?? null,
    player_a2_id: (row.player_a2_id as number | null | undefined) ?? null,
    player_b_id: (row.player_b_id as number | null | undefined) ?? null,
    player_b2_id: (row.player_b2_id as number | null | undefined) ?? null,
    score_a: Number(row.score_a ?? 0),
    score_b: Number(row.score_b ?? 0),
    fun_rating_a: (row.fun_rating_a as number | null | undefined) ?? null,
    fun_rating_b: (row.fun_rating_b as number | null | undefined) ?? null,
    comment: (row.comment as string | null | undefined) ?? null,
    status: String(row.status ?? 'scheduled'),
    round: (row.round as string | null | undefined) ?? null,
    bracket_order: Number(row.bracket_order ?? 0),
    round_index: Number(row.round_index ?? 0),
    parent_a_match_id: (row.parent_a_match_id as number | null | undefined) ?? null,
    parent_b_match_id: (row.parent_b_match_id as number | null | undefined) ?? null,
  }
}

export default async function Home() {
  const [{ groups }, cookieStore] = await Promise.all([
    getGroupsForNav(),
    cookies(),
  ])
  const clusterSel = parseClusterSelection(
    groups,
    cookieStore.get(CLUSTER_COOKIE_NAME)?.value
  )
  const clusterName =
    clusterSel === 'all'
      ? 'Все кластеры'
      : groups.find((g) => g.id === clusterSel)?.name ?? 'Кластер'

  let tournamentsQuery = supabase
    .from('tournaments')
    .select('*')
    .order('scheduled_date', { ascending: false })
  if (clusterSel !== 'all') {
    tournamentsQuery = tournamentsQuery.eq('group_id', clusterSel)
  }
  const { data: tournaments, error } = await tournamentsQuery

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="rounded-2xl border-4 border-[var(--clay)] bg-[var(--clay-soft)] p-6 font-bold text-[var(--ink)]">
          Ошибка загрузки: {supabaseErrorMessage(error)}
        </p>
        <p className="mt-4 max-w-2xl text-sm font-semibold text-[var(--ink-muted)]">
          Чаще всего: обрыв до Supabase (VPN, Wi‑Fi, антивирус, DNS, IPv6). Клиент в проекте
          делает до 4 повторов запроса. Проверьте URL в браузере и .env.local (Supabase →
          Project Settings → API). Dev: в package.json для `dev` уже задан устойчивый DNS
          (ipv4first).
        </p>
      </div>
    )
  }

  const list = (tournaments ?? []).map((t) =>
    normalizeTournament(t as Tournament & Record<string, unknown>)
  )
  const active = list.filter((t) => t.status === 'active')
  const archived = list.filter((t) => t.status === 'archived')

  let playersQuery = supabase.from('players').select('*').order('name')
  if (clusterSel !== 'all') {
    playersQuery = playersQuery.eq('group_id', clusterSel)
  }
  const { data: playersRaw } = await playersQuery
  const clusterPlayers = (playersRaw ?? []) as Player[]

  const tourIds = list.map((t) => t.id)
  let groupMatches: Match[] = []
  if (tourIds.length > 0) {
    const { data: gm } = await supabase
      .from('matches')
      .select('*')
      .in('tournament_id', tourIds)
    groupMatches = (gm ?? []).map((r) =>
      normalizeMatch(r as Record<string, unknown>)
    )
  }
  const clusterFunRank = computeFunStarsSumLeaderboard(
    clusterPlayers,
    groupMatches
  )
  const rankRows = clusterFunRank
    .filter((r) => r.funCount > 0 || r.funSum > 0)
    .slice(0, 20)

  const clusterStats = computeClusterSummaryStats(
    list,
    clusterPlayers,
    groupMatches
  )

  return (
    <main className="relative flex-1">
        <div className="court-hero relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
          <div className="relative mx-auto max-w-6xl">
            <HomeClusterCorner groups={groups} value={clusterSel} />
            <p className="mb-2 pr-[200px] text-sm font-bold text-[var(--cream)]/90 sm:pr-[300px]">
              🏠 Сейчас:{' '}
              <span className="text-[var(--lime)]">{clusterName}</span>
            </p>
            <p className="mb-3 inline-flex rotate-[-2deg] items-center gap-2 rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]">
              🎾 турниры · Рейтинг FUN · Живые эмоции
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-black leading-[0.95] text-[var(--cream)] sm:text-6xl lg:text-7xl">
              ЗАПЕРТЫЕ
              <br />
              <span className="text-[var(--lime)]">В СПОРТИВНОМ ЗАЛЕ</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium text-[var(--cream)]/85">
              Турниры, матчи и звёздный FUN-индекс: кто не только выигрывает, но и
              зажигает в зале.
            </p>
            <p className="mt-4 text-sm font-bold text-[var(--cream)]/80">
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--cream)]/50 bg-[var(--court-deep)]/40 px-3 py-1.5 text-[var(--lime)] transition hover:border-[var(--lime)] hover:bg-[var(--court-deep)]"
              >
                🛠️ Админ-панель
              </Link>
            </p>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
          <section className="mb-16">
            <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
              <span>📊</span>{' '}
              {clusterSel === 'all' ? 'Общий рейтинг FUN · ТОП 20' : 'Рейтинг FUN кластера · ТОП 20'}
            </h2>
            <p className="mb-4 text-sm font-semibold text-[var(--ink-muted)]">
              {clusterSel === 'all'
                ? 'ТОП 20 по сумме звёзд по всем кластерам.'
                : `ТОП 20 по сумме звёзд в кластере «${clusterName}».`}
            </p>
            <div className="overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[4px_4px_0_var(--ink)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--court)] text-[var(--cream)]">
                  <tr>
                    <th className="px-4 py-3 font-black">#</th>
                    <th className="px-4 py-3 font-black">Игрок</th>
                    <th className="px-4 py-3 font-black">Оценок</th>
                    <th className="px-4 py-3 font-black">Сумма ★</th>
                  </tr>
                </thead>
                <tbody>
                  {rankRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="border-t-2 border-[var(--ink)] odd:bg-[var(--cream)]/40"
                    >
                      <td className="px-4 py-3 font-mono font-bold">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold">
                        <Link
                          href={`/player/${row.id}`}
                          className="inline-flex items-center transition hover:underline"
                        >
                          <span className="mr-2 text-xl">{row.avatar_emoji}</span>
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">
                        {row.funCount}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold">
                        {row.funSum}★
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rankRows.length === 0 && (
                <p className="p-6 text-center text-[var(--ink-muted)]">
                  Пока нет оценок FUN.
                </p>
              )}
            </div>
          </section>

          <ClusterStatsBlock
            clusterName={clusterName}
            allClusters={clusterSel === 'all'}
            completedMatchCount={clusterStats.completedMatchCount}
            tournamentCount={clusterStats.tournamentCount}
            topFunPlayer={clusterStats.topFunPlayer}
            top3Tournaments={clusterStats.top3Tournaments}
          />

          <section className="mb-16">
            <h2 className="mb-6 flex items-center gap-2 font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)]">
              <span>⚡</span> Активные турниры
            </h2>
            {active.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-10 text-center font-semibold text-[var(--ink-muted)]">
                Пока тихо в зале…{' '}
                <Link href="/admin" className="font-bold text-[var(--clay)] underline">
                  Откройте админку
                </Link>{' '}
                и создайте турнир 🛠️
              </p>
            ) : (
              <ul className="grid gap-6 lg:grid-cols-2 stagger-in">
                {active.map((t, i) => {
                  const b = formatBadge(t)
                  return (
                    <li key={t.id} style={{ animationDelay: `${i * 70}ms` }}>
                      <article className="group relative h-full overflow-hidden rounded-3xl border-4 border-[var(--ink)] bg-[var(--surface)] shadow-[8px_8px_0_var(--ink)] transition duration-300 hover:-translate-y-1 hover:shadow-[12px_12px_0_var(--ink)]">
                        <div className="absolute -right-6 -top-6 h-28 w-28 rotate-12 rounded-3xl border-2 border-[var(--ink)] bg-[var(--lime)] opacity-90 transition group-hover:rotate-6" />
                        <div className="relative p-6 sm:p-8">
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-1 text-xs font-black uppercase tracking-wide">
                              <span className="text-base">{b.emoji}</span>
                              {b.label}
                            </span>
                            <span className="text-xs font-bold text-[var(--ink-muted)]">
                              📅 {formatDate(t.scheduled_date)}
                            </span>
                          </div>
                          <h3 className="font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)] sm:text-3xl">
                            {t.name}
                          </h3>
                          {t.description && (
                            <p className="mt-3 line-clamp-3 text-[var(--ink-muted)]">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-6">
                            <Link
                              href={`/tournament/${t.id}`}
                              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] px-5 py-2.5 text-sm font-black text-[var(--cream)] shadow-[4px_4px_0_var(--ink)] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                            >
                              Подробнее →
                            </Link>
                          </div>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mb-24">
            <h2 className="mb-6 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
              <span>📦</span> Архив
            </h2>
            {archived.length === 0 ? (
              <p className="text-[var(--ink-muted)]">
                Архив пуст — всё ещё в игре.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {archived.map((t) => {
                  const b = formatBadge(t)
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/tournament/${t.id}`}
                        className="flex items-center justify-between gap-4 rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-4 py-4 shadow-[3px_3px_0_var(--ink)] transition hover:bg-[var(--cream)]"
                      >
                        <div>
                          <p className="font-bold text-[var(--ink)]">{t.name}</p>
                          <p className="text-xs text-[var(--ink-muted)]">
                            {b.emoji} {b.label} · {formatDate(t.scheduled_date)}
                          </p>
                        </div>
                        <span className="text-xl">🏁</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
    </main>
  )
}
