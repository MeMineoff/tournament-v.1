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
import {
  chunkPairsFromParticipantIds,
  computeDoublesTeamRoundRobinStandings,
} from '@/lib/doublesTeamStandings'
import { isDoublesParticipantType } from '@/lib/participantType'
import type { TournamentArchiveStats } from '@/lib/aggregateStats'
import { TournamentStatsBlock } from '@/components/tournament/TournamentStatsBlock'

type Tab = 'matches' | 'fun' | 'table'

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
  archiveStats: TournamentArchiveStats
}

export default function TournamentView({
  tournament,
  players,
  matches,
  clusterMismatch,
  archiveStats,
}: Props) {
  const isPlayoffFormat = tournament.format === 'playoff'

  const [tab, setTab] = useState<Tab>(() =>
    isPlayoffFormat ? 'matches' : 'table'
  )
  const [modalMatch, setModalMatch] = useState<MatchEnriched | null>(null)

  const scopePlayers = useMemo(
    () => tournamentPlayers(tournament, players),
    [tournament, players]
  )

  const standingsMatches = useMemo(
    () => matchesForGroupTable(tournament, matches),
    [tournament, matches]
  )

  const funRows = useMemo(
    () => computeFunStarsSumLeaderboard(scopePlayers, matches),
    [scopePlayers, matches]
  )

  const standings = useMemo(
    () => computeStandings(scopePlayers, standingsMatches),
    [scopePlayers, standingsMatches]
  )

  const funSumByPlayerId = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of funRows) m.set(r.id, r.funSum)
    return m
  }, [funRows])

  const doublesPairs = useMemo(
    () => chunkPairsFromParticipantIds(tournament.participant_ids),
    [tournament.participant_ids]
  )

  const useDoublesTeamTable =
    !isPlayoffFormat &&
    isDoublesParticipantType(tournament.participant_type) &&
    doublesPairs.length > 0

  const teamStandingsRR = useMemo(
    () =>
      useDoublesTeamTable
        ? computeDoublesTeamRoundRobinStandings(
            scopePlayers,
            standingsMatches,
            doublesPairs
          )
        : [],
    [useDoublesTeamTable, scopePlayers, standingsMatches, doublesPairs]
  )

  const formatBlock = formatBlockLabel(tournament)
  const typeLabel = isDoublesParticipantType(tournament.participant_type)
    ? 'Пары'
    : 'Одиночный'

  const rrMatches = useMemo(
    () => matches.filter(isRoundRobinMatch),
    [matches]
  )

  const playoffDoublesLayout =
    isPlayoffFormat && isDoublesParticipantType(tournament.participant_type)

  const visibleTabs = useMemo(() => {
    const base: { id: Tab; label: string; emoji: string }[] = [
      { id: 'matches', label: isPlayoffFormat ? 'Сетка' : 'Матчи', emoji: '🗓️' },
      { id: 'fun', label: 'FUN-рейтинг', emoji: '🌈' },
    ]
    if (!isPlayoffFormat) {
      base.push({ id: 'table', label: 'Таблица', emoji: '📊' })
    }
    return base
  }, [isPlayoffFormat])

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

      <TournamentStatsBlock tournament={tournament} stats={archiveStats} />

      <div
        className="mb-8 flex flex-wrap gap-2 border-b-4 border-[var(--ink)] pb-4"
        role="tablist"
        aria-label="Разделы турнира"
      >
        {visibleTabs.map((t) => (
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
          aria-label="Матчи турнира"
        >
          {matches.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Матчей пока нет — для круга добавьте их в админке турнира 🛠️
            </p>
          ) : isPlayoffFormat ? (
            <PlayoffBracket
              matches={matches}
              onMatchClick={setModalMatch}
              doublesBracket={playoffDoublesLayout}
            />
          ) : rrMatches.length > 0 ? (
            <div>
              <h3 className="mb-4 font-[family-name:var(--font-display)] text-xl font-black text-[var(--ink)]">
                Матчи
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
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Матчей круга пока нет.
            </p>
          )}
        </section>
      )}

      {tab === 'fun' && (
        <section role="tabpanel" aria-label="FUN рейтинг">
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            Сумма звёзд FUN только в матчах этого турнира (по убыванию).
          </p>
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

      {tab === 'table' && !isPlayoffFormat && (
        <section role="tabpanel" aria-label="Турнирная таблица">
          {typeLabel === 'Пары' && doublesPairs.length === 0 && (
            <p className="mb-3 text-sm text-[var(--ink-muted)]">
              Чтобы таблица шла <strong>по парам</strong>, в составе турнира должно быть{' '}
              <strong>чётное</strong> число участников; в админке список id задаёт пары{' '}
              <strong>по два подряд</strong> (1-й и 2-й = первая пара, 3-й и 4-й = вторая…).
              Сейчас показана персональная таблица.
            </p>
          )}
          {useDoublesTeamTable && teamStandingsRR.length > 0 && (
            <p className="mb-3 text-sm text-[var(--ink-muted)]">
              Таблица по <strong>парам</strong>: в составе турнира два id подряд = одна команда. Очки
              и матчи — на команду, не на каждого игрока отдельно. FUN ★ в столбце — сумма пары
              (оба в этом турнире).
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[6px_6px_0_var(--ink)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--ink)]">
                <tr>
                  <th className="px-4 py-3 font-black">#</th>
                  <th className="px-4 py-3 font-black">
                    {useDoublesTeamTable && teamStandingsRR.length > 0 ? 'Пара' : 'Игрок'}
                  </th>
                  <th className="px-4 py-3 font-black">Матчи</th>
                  <th className="px-4 py-3 font-black">Победы</th>
                  <th className="px-4 py-3 font-black">Очки</th>
                  <th className="px-4 py-3 font-black">Сумма ★</th>
                </tr>
              </thead>
              <tbody>
                {useDoublesTeamTable && teamStandingsRR.length > 0
                  ? teamStandingsRR.map((row, idx) => {
                      const funSum =
                        (funSumByPlayerId.get(row.playerA.id) ?? 0) +
                        (funSumByPlayerId.get(row.playerB.id) ?? 0)
                      return (
                        <tr
                          key={`${row.playerA.id}-${row.playerB.id}`}
                          className="border-t-2 border-[var(--ink)] odd:bg-[var(--cream)]/40"
                        >
                          <td className="px-4 py-3 font-mono font-bold">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            <div className="flex min-w-0 flex-col gap-1">
                              <Link
                                href={`/player/${row.playerA.id}`}
                                className="inline-flex min-w-0 items-center transition hover:underline"
                              >
                                <span className="mr-2 text-xl">
                                  {row.playerA.avatar_emoji}
                                </span>
                                <span className="truncate">{row.playerA.name}</span>
                              </Link>
                              <Link
                                href={`/player/${row.playerB.id}`}
                                className="inline-flex min-w-0 items-center text-[var(--ink-muted)] transition hover:underline"
                              >
                                <span className="mr-2 text-lg">
                                  {row.playerB.avatar_emoji}
                                </span>
                                <span className="truncate text-sm">
                                  {row.playerB.name}
                                </span>
                              </Link>
                            </div>
                          </td>
                          <td className="px-4 py-3">{row.played}</td>
                          <td className="px-4 py-3">{row.wins}</td>
                          <td className="px-4 py-3 font-mono font-black text-[var(--clay)]">
                            {row.points}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold tabular-nums">
                            {funSum}★
                          </td>
                        </tr>
                      )
                    })
                  : standings.map((row, idx) => (
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
                    <td className="px-4 py-3">{row.played}</td>
                    <td className="px-4 py-3">{row.wins}</td>
                    <td className="px-4 py-3 font-mono font-black text-[var(--clay)]">
                      {row.points}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold tabular-nums">
                      {funSumByPlayerId.get(row.id) ?? 0}★
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
        canEditScore={false}
        canAssignRoster={false}
        tournamentMatches={matches}
      />
    </div>
  )
}
