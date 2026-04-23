'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { MatchEnriched, Player, Tournament } from '@/lib/types'
import {
  computeFunStarsSumLeaderboard,
  computeStandings,
  isRoundRobinMatch,
  matchesForGroupTable,
  tournamentPlayers,
} from '@/lib/stats'
import { MatchModal } from '@/components/tournament/MatchModal'
import { PlayoffBracket } from '@/components/tournament/PlayoffBracket'
import { isDoublesParticipantType } from '@/lib/participantType'

type Tab = 'matches' | 'fun' | 'table'

const tabs: { id: Tab; label: string; emoji: string }[] = [
  { id: 'matches', label: 'Сетка матчей', emoji: '🗓️' },
  { id: 'fun', label: 'FUN-рейтинг', emoji: '🌈' },
  { id: 'table', label: 'Таблица', emoji: '📊' },
]

function formatDate(d: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(d))
  } catch {
    return d
  }
}

function formatBlockLabel(tournament: Tournament) {
  if (tournament.format === 'playoff') {
    return { label: 'Плей-офф', emoji: '🏆' }
  }
  if (tournament.format === 'mixed') {
    return { label: 'Круг + плей-офф', emoji: '🔀' }
  }
  return { label: 'Круговая система', emoji: '⭕' }
}

type Props = {
  tournament: Tournament
  players: Player[]
  matches: MatchEnriched[]
  clusterMismatch?: {
    tournamentGroupName: string
    selectedGroupName: string
  }
}

export default function TournamentView({
  tournament,
  players,
  matches,
  clusterMismatch,
}: Props) {
  const [tab, setTab] = useState<Tab>('matches')
  const [modalMatch, setModalMatch] = useState<MatchEnriched | null>(null)

  const scopePlayers = useMemo(
    () => tournamentPlayers(tournament, players),
    [tournament, players]
  )

  const standingsMatches = useMemo(
    () => matchesForGroupTable(tournament, matches),
    [tournament, matches]
  )

  const funMatches = useMemo(() => {
    const ids = tournament.participant_ids
    if (!ids?.length) return matches
    const set = new Set(ids)
    return matches.filter((m) => {
      const ok = (id: number | null) => id == null || set.has(id)
      return (
        ok(m.player_a_id) &&
        ok(m.player_a2_id) &&
        ok(m.player_b_id) &&
        ok(m.player_b2_id)
      )
    })
  }, [matches, tournament.participant_ids])

  const funRows = useMemo(
    () => computeFunStarsSumLeaderboard(scopePlayers, funMatches),
    [scopePlayers, funMatches]
  )
  const standings = useMemo(
    () => computeStandings(scopePlayers, standingsMatches),
    [scopePlayers, standingsMatches]
  )

  const formatBlock = formatBlockLabel(tournament)
  const typeLabel = isDoublesParticipantType(tournament.participant_type)
    ? 'Пары'
    : 'Одиночный'

  const rrMatches = useMemo(
    () => matches.filter(isRoundRobinMatch),
    [matches]
  )
  const hasPlayoffTree = useMemo(
    () => matches.some((m) => !isRoundRobinMatch(m)),
    [matches]
  )

  const playoffDoublesLayout =
    tournament.format === 'playoff' &&
    isDoublesParticipantType(tournament.participant_type)

  const showBracket =
    tournament.format === 'playoff' ||
    (tournament.format === 'mixed' && hasPlayoffTree)

  /** Список «карточек» только для круга и чистого round_robin (не для playoff). */
  const showRoundRobinList =
    (tournament.format === 'round_robin' ||
      tournament.format === 'mixed') &&
    rrMatches.length > 0

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        ← На главную
      </Link>

      {clusterMismatch && (
        <div
          role="alert"
          className="mb-8 rounded-2xl border-4 border-[var(--clay)] bg-[var(--clay-soft)] px-4 py-3 text-sm font-bold text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]"
        >
          ⚠️ Турнир из кластера «{clusterMismatch.tournamentGroupName}», а в шапке
          выбран «{clusterMismatch.selectedGroupName}». Переключите 🏠 Кластер в
          навигации или откройте турнир из текущего кластера на главной.
        </div>
      )}

      <header className="relative mb-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1 text-xs font-black uppercase tracking-widest text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]">
            {tournament.status === 'active' ? '🔥 Активен' : '📦 Архив'}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-black leading-none text-[var(--ink)] sm:text-5xl">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
              {tournament.description}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-2 text-sm font-bold shadow-[3px_3px_0_var(--ink)]">
              <span className="text-lg">{formatBlock.emoji}</span>
              {formatBlock.label}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2 text-sm font-bold shadow-[3px_3px_0_var(--ink)]">
              <span>👤</span>
              {typeLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 text-sm font-bold shadow-[3px_3px_0_var(--ink)]">
              <span>📅</span>
              {formatDate(tournament.scheduled_date)}
            </span>
          </div>
        </div>
      </header>

      <div
        className="mb-8 flex flex-wrap gap-2 border-b-4 border-[var(--ink)] pb-4"
        role="tablist"
        aria-label="Разделы турнира"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border-2 border-[var(--ink)] px-4 py-2 text-sm font-black transition ${
              tab === t.id
                ? 'bg-[var(--clay)] text-[var(--cream)] shadow-[4px_4px_0_var(--ink)]'
                : 'bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--lime)]'
            }`}
          >
            <span className="mr-1">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'matches' && (
        <section
          className="space-y-10 stagger-in"
          role="tabpanel"
          aria-label="Сетка матчей"
        >
          {matches.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Матчей пока нет — добавьте их в админке 🛠️
            </p>
          ) : tournament.format === 'playoff' ? (
            <PlayoffBracket
              matches={matches}
              onMatchClick={setModalMatch}
              doublesBracket={playoffDoublesLayout}
            />
          ) : (
            <>
              {showRoundRobinList && (
                <div>
                  <h3 className="mb-4 font-[family-name:var(--font-display)] text-xl font-black text-[var(--ink)]">
                    {tournament.format === 'mixed'
                      ? '🔵 Круговая стадия'
                      : 'Матчи'}
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {rrMatches.map((m, i) => (
                      <li key={m.id} style={{ animationDelay: `${i * 45}ms` }}>
                        <button
                          type="button"
                          onClick={() => setModalMatch(m)}
                          className="group w-full rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-4 text-left shadow-[4px_4px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)]"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full border border-[var(--ink)] px-2 py-0.5 text-[10px] font-black uppercase ${
                                m.status === 'completed'
                                  ? 'bg-[var(--lime)] text-[var(--ink)]'
                                  : 'bg-[var(--cream)] text-[var(--ink-muted)]'
                              }`}
                            >
                              {m.status === 'completed'
                                ? '✓ Завершён'
                                : '⏳ Запланирован'}
                            </span>
                            <span className="text-xs font-bold text-[var(--ink-muted)]">
                              жми, чтобы открыть ✨
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{m.player_a_emoji}</span>
                                <span className="truncate font-bold leading-tight">
                                  {m.player_a_name}
                                </span>
                              </div>
                              {(m.player_a2_id != null || m.player_a2_name) && (
                                <div className="flex items-center gap-2 pl-1 text-sm">
                                  <span>{m.player_a2_emoji}</span>
                                  <span className="truncate font-semibold">
                                    {m.player_a2_name || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 font-mono text-lg font-black text-[var(--clay)]">
                              {m.score_a}:{m.score_b}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-bold leading-tight">
                                  {m.player_b_name}
                                </span>
                                <span className="text-2xl">{m.player_b_emoji}</span>
                              </div>
                              {(m.player_b2_id != null || m.player_b2_name) && (
                                <div className="flex items-center gap-2 pr-1 text-sm">
                                  <span className="truncate font-semibold">
                                    {m.player_b2_name || '—'}
                                  </span>
                                  <span>{m.player_b2_emoji}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showBracket && (
                <div>
                  <h3 className="mb-4 font-[family-name:var(--font-display)] text-xl font-black text-[var(--ink)]">
                    🏆 Плей-офф
                  </h3>
                  <PlayoffBracket
                    matches={matches}
                    onMatchClick={setModalMatch}
                    doublesBracket={isDoublesParticipantType(
                      tournament.participant_type
                    )}
                  />
                </div>
              )}

              {tournament.format === 'round_robin' &&
                rrMatches.length === 0 &&
                matches.length > 0 && (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {matches.map((m, i) => (
                      <li key={m.id} style={{ animationDelay: `${i * 45}ms` }}>
                        <button
                          type="button"
                          onClick={() => setModalMatch(m)}
                          className="group w-full rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-4 text-left shadow-[4px_4px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)]"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full border border-[var(--ink)] px-2 py-0.5 text-[10px] font-black uppercase ${
                                m.status === 'completed'
                                  ? 'bg-[var(--lime)] text-[var(--ink)]'
                                  : 'bg-[var(--cream)] text-[var(--ink-muted)]'
                              }`}
                            >
                              {m.status === 'completed'
                                ? '✓ Завершён'
                                : '⏳ Запланирован'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{m.player_a_emoji}</span>
                                <span className="truncate font-bold leading-tight">
                                  {m.player_a_name}
                                </span>
                              </div>
                              {(m.player_a2_id != null || m.player_a2_name) && (
                                <div className="flex items-center gap-2 pl-1 text-sm">
                                  <span>{m.player_a2_emoji}</span>
                                  <span className="truncate font-semibold">
                                    {m.player_a2_name || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 font-mono text-lg font-black text-[var(--clay)]">
                              {m.score_a}:{m.score_b}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-bold leading-tight">
                                  {m.player_b_name}
                                </span>
                                <span className="text-2xl">{m.player_b_emoji}</span>
                              </div>
                              {(m.player_b2_id != null || m.player_b2_name) && (
                                <div className="flex items-center gap-2 pr-1 text-sm">
                                  <span className="truncate font-semibold">
                                    {m.player_b2_name || '—'}
                                  </span>
                                  <span>{m.player_b2_emoji}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}
        </section>
      )}

      {tab === 'fun' && (
        <section role="tabpanel" aria-label="FUN рейтинг">
          <div className="overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[6px_6px_0_var(--ink)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--lime)] text-[var(--ink)]">
                <tr>
                  <th className="px-4 py-3 font-black">#</th>
                  <th className="px-4 py-3 font-black">Игрок</th>
                  <th className="px-4 py-3 font-black">Оценок</th>
                  <th className="px-4 py-3 font-black">Сумма ★</th>
                </tr>
              </thead>
              <tbody>
                {funRows.map((row, idx) => (
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
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-[var(--ink)] bg-[var(--clay-soft)] px-2 py-0.5 font-mono font-bold tabular-nums">
                        {row.funSum}★
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'table' && (
        <section role="tabpanel" aria-label="Турнирная таблица">
          {tournament.format === 'mixed' && (
            <p className="mb-3 text-sm font-bold text-[var(--ink-muted)]">
              По результатам круговой стадии (плей-офф не учитывается).
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[6px_6px_0_var(--ink)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--ink)]">
                <tr>
                  <th className="px-4 py-3 font-black">#</th>
                  <th className="px-4 py-3 font-black">Имя</th>
                  <th className="px-4 py-3 font-black">Матчи</th>
                  <th className="px-4 py-3 font-black">Победы</th>
                  <th className="px-4 py-3 font-black">Очки</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-t-2 border-[var(--ink)] odd:bg-[var(--cream)]/40"
                  >
                    <td className="px-4 py-3 font-mono font-bold">{idx + 1}</td>
                    <td className="px-4 py-3 font-bold">
                      <span className="mr-2 text-xl">{row.avatar_emoji}</span>
                      {row.name}
                    </td>
                    <td className="px-4 py-3">{row.played}</td>
                    <td className="px-4 py-3">{row.wins}</td>
                    <td className="px-4 py-3 font-mono font-black text-[var(--clay)]">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <MatchModal
        match={modalMatch}
        open={modalMatch != null}
        onClose={() => setModalMatch(null)}
        tournament={tournament}
        players={players}
        doublesTournament={isDoublesParticipantType(tournament.participant_type)}
      />
    </div>
  )
}
