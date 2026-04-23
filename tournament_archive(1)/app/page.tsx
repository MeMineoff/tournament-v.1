import Link from 'next/link'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabaseClient'
import type { Group, Match, Player, Tournament } from '@/lib/types'
import {
  computeFunLeaderboard,
  computeFunStarsSumLeaderboard,
  tournamentPlayers,
} from '@/lib/stats'
import { CLUSTER_COOKIE_NAME, parseClusterSelection } from '@/lib/cluster'
import { HomeClusterCorner } from '@/components/HomeClusterCorner'

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
  if (t.format === 'mixed') {
    return { label: 'Круг + плей-офф', emoji: '🔀' }
  }
  return { label: 'Круг', emoji: '⭕' }
}

function normalizeTournament(row: Tournament & Record<string, unknown>): Tournament {
  const pid = row.participant_ids
  let participant_ids: number[] | null = null
  if (Array.isArray(pid)) {
    participant_ids = pid.map((x) => Number(x))
  }
  return {
    ...row,
    playoff_bracket_size: row.playoff_bracket_size ?? null,
    playoff_advancers: row.playoff_advancers ?? null,
    participant_ids,
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

function starRow(avg: number) {
  const filled = Math.min(5, Math.max(0, Math.round(avg)))
  return (
    <span className="inline-flex gap-0.5 text-sm" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i}>{i <= filled ? '⭐' : '✩'}</span>
      ))}
    </span>
  )
}

export default async function Home() {
  const [{ data: groupsRaw }, cookieStore] = await Promise.all([
    supabase.from('groups').select('*').order('id'),
    cookies(),
  ])
  const groups = (groupsRaw ?? []) as Group[]
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
          Ошибка загрузки: {error.message}
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

  let topFunBlock: {
    tournament: Tournament
    top: ReturnType<typeof computeFunLeaderboard>
  } | null = null

  if (archived.length > 0) {
    const order = [...archived].sort(() => Math.random() - 0.5)
    const tries = Math.min(12, order.length)
    for (let i = 0; i < tries; i++) {
      const pick = order[i]!
      const [{ data: matchesRaw }, { data: playersRaw }] = await Promise.all([
        supabase.from('matches').select('*').eq('tournament_id', pick.id),
        supabase
          .from('players')
          .select('*')
          .eq('group_id', pick.group_id)
          .order('name'),
      ])
      const tMatches = (matchesRaw ?? []).map((r) =>
        normalizeMatch(r as Record<string, unknown>)
      )
      const tPlayers = (playersRaw ?? []) as Player[]
      const scope = tournamentPlayers(pick, tPlayers)
      const board = computeFunLeaderboard(scope, tMatches).filter(
        (r) => r.funAvg != null
      )
      if (board.length > 0) {
        topFunBlock = { tournament: pick, top: board.slice(0, 3) }
        break
      }
    }
  }

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
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
          <section className="mb-16">
            <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)] sm:text-3xl">
              <span>🔥</span> Топ FUN
            </h2>
            {archived.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] px-6 py-8 text-center font-bold text-[var(--ink-muted)]">
                Скоро появится
              </p>
            ) : topFunBlock ? (
              <div className="rounded-3xl border-4 border-[var(--ink)] bg-[var(--lime)]/25 p-6 shadow-[6px_6px_0_var(--ink)] sm:p-8">
                <p className="font-[family-name:var(--font-display)] text-lg font-black text-[var(--ink)] sm:text-xl">
                  Турнир:{' '}
                  <Link
                    href={`/tournament/${topFunBlock.tournament.id}`}
                    className="underline decoration-2 underline-offset-4 hover:text-[var(--clay)]"
                  >
                    {topFunBlock.tournament.name}
                  </Link>
                </p>
                <ol className="mt-6 space-y-4">
                  {topFunBlock.top.map((row, idx) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-3 shadow-[3px_3px_0_var(--ink)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-[var(--cream)] font-mono text-sm font-black">
                          {idx + 1}
                        </span>
                        <span className="text-2xl">{row.avatar_emoji}</span>
                        <span className="truncate font-bold text-[var(--ink)]">
                          {row.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                        {starRow(row.funAvg!)}
                        <span className="font-mono text-sm font-black text-[var(--clay)]">
                          {row.funAvg!.toFixed(2)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] px-6 py-8 text-center font-bold text-[var(--ink-muted)]">
                Скоро появится
              </p>
            )}
          </section>

          <section className="mb-16">
            <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
              <span>📊</span>{' '}
              {clusterSel === 'all' ? 'Рейтинг FUN (общий)' : 'Рейтинг FUN кластера'}
            </h2>
            <p className="mb-4 text-sm font-semibold text-[var(--ink-muted)]">
              {clusterSel === 'all'
                ? 'Сумма звёзд по всем матчам всех турниров на главной (все кластеры).'
                : `Сумма звёзд по всем матчам турниров группы «${clusterName}».`}
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
                  {clusterFunRank.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="border-t-2 border-[var(--ink)] odd:bg-[var(--cream)]/40"
                    >
                      <td className="px-4 py-3 font-mono font-bold">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold">
                        <span className="mr-2 text-xl">{row.avatar_emoji}</span>
                        {row.name}
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
              {clusterPlayers.length === 0 && (
                <p className="p-6 text-center text-[var(--ink-muted)]">
                  В кластере пока нет игроков
                </p>
              )}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-black text-[var(--ink)]">
              <span>👥</span>{' '}
              {clusterSel === 'all' ? 'Игроки (все кластеры)' : 'Игроки кластера'}
            </h2>
            {clusterPlayers.length === 0 ? (
              <p className="text-[var(--ink-muted)]">Пока пусто — добавьте в админке.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {clusterPlayers.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_var(--ink)]"
                  >
                    <span className="mr-1">{p.avatar_emoji}</span>
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-16">
            <h2 className="mb-6 flex items-center gap-2 font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)]">
              <span>⚡</span> Активные турниры
            </h2>
            {active.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-10 text-center font-semibold text-[var(--ink-muted)]">
                Пока тихо в зале… Создайте турнир в админке 🛠️
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
