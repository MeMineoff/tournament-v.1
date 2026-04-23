import Link from 'next/link'
import { notFound } from 'next/navigation'
import { normalizeParticipantIds } from '@/lib/participantIds'
import { supabase } from '@/lib/supabaseClient'
import { computePlayerCareerStats } from '@/lib/aggregateStats'
import type { Match, Player, Tournament } from '@/lib/types'
import { DarkStatCard } from '@/components/stats/DarkStatCard'

export const dynamic = 'force-dynamic'

type Params = { id: string }

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

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { id: idParam } = await params
  const playerId = Number(idParam)
  if (!Number.isFinite(playerId)) notFound()

  const { data: player, error: pErr } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (pErr || !player) notFound()
  const p = player as Player

  const orLine = `player_a_id.eq.${playerId},player_a2_id.eq.${playerId},player_b_id.eq.${playerId},player_b2_id.eq.${playerId}`
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'completed')
    .or(orLine)

  const completed = (matchesRaw ?? []).map((r) => normalizeMatch(r as Record<string, unknown>))
  const tids = [...new Set(completed.map((m) => m.tournament_id))] as number[]
  let tournamentById = new Map<number, Tournament>()
  if (tids.length > 0) {
    const { data: tr } = await supabase
      .from('tournaments')
      .select('*')
      .in('id', tids)
    for (const row of tr ?? []) {
      const t = normalizeTournament(row as Tournament & Record<string, unknown>)
      tournamentById.set(t.id, t)
    }
  }

  const career = computePlayerCareerStats(playerId, completed, tournamentById)

  return (
    <main className="relative flex-1">
      <div className="court-hero relative overflow-hidden px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
        <div className="relative mx-auto max-w-4xl">
          <Link
            href="/"
            className="mb-4 inline-flex text-sm font-bold text-[var(--cream)]/90 hover:underline"
          >
            ← На главную
          </Link>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--cream)]/80">
            🎾 Tennis Fun Cup
          </p>
          <h1 className="flex flex-wrap items-end gap-3 font-[family-name:var(--font-display)] text-4xl font-black text-[var(--cream)] sm:text-5xl">
            <span className="text-5xl sm:text-6xl" aria-hidden>
              {p.avatar_emoji}
            </span>
            <span>{p.name}</span>
          </h1>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <DarkStatCard emoji="🎾" label="Матчей (завершено)">
            {career.totalMatches}
          </DarkStatCard>
          <DarkStatCard emoji="✅" label="Победы">
            {career.wins}
          </DarkStatCard>
          <DarkStatCard emoji="📉" label="Поражения">
            {career.losses}
          </DarkStatCard>
          <DarkStatCard emoji="⚖️" label="Ничьи">
            {career.draws}
          </DarkStatCard>
        </div>

        <div className="mb-6 rounded-3xl border-2 border-[var(--ink)] bg-[var(--surface)] p-5 shadow-[6px_6px_0_var(--ink)] sm:p-6">
          <h2 className="mb-1 font-[family-name:var(--font-display)] text-xl font-black text-[var(--ink)]">
            🏆 Турниры
          </h2>
          <p className="text-sm font-semibold text-[var(--ink-muted)]">
            Уникальных турниров с завершёнными матчами:{' '}
            <span className="font-mono font-bold text-[var(--clay)]">
              {career.tournamentCount}
            </span>
          </p>
        </div>

        {career.bestTournament && (
          <div className="mb-10 rounded-3xl border-2 border-[var(--ink)] bg-[var(--court)] p-5 text-[var(--cream)] shadow-[4px_4px_0_var(--ink)] sm:p-6">
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg font-black text-[var(--lime)]">
              ⭐ Лучший турнир
            </h2>
            <p className="mb-4 text-sm text-[var(--cream)]/75">
              По сумме твоих FUN-звёзд в рамках одного турнира (при равенстве — больше побед в
              этом турнире).
            </p>
            <Link
              href={`/tournament/${career.bestTournament.tournament.id}`}
              className="mb-2 block text-xl font-black text-[var(--lime)] hover:underline"
            >
              {career.bestTournament.tournament.name}
            </Link>
            <p className="text-sm text-[var(--cream)]/70">
              📅 {formatDate(career.bestTournament.tournament.scheduled_date)}
            </p>
            <p className="mt-2 font-mono text-lg">
              {career.bestTournament.funSum}★ · {career.bestTournament.wins} побед
            </p>
            {career.bestTournamentByWins && (
              <p className="mt-4 border-t border-[var(--cream)]/20 pt-4 text-sm text-[var(--cream)]/80">
                По числу побед лидирует{' '}
                <Link
                  className="font-bold text-[var(--lime)] hover:underline"
                  href={`/tournament/${career.bestTournamentByWins.tournament.id}`}
                >
                  {career.bestTournamentByWins.tournament.name}
                </Link>
                <span className="font-mono"> ({career.bestTournamentByWins.wins} п.)</span>
              </p>
            )}
          </div>
        )}

        {career.tournamentCount === 0 && (
          <p className="mb-8 rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface-2)] p-6 text-center font-semibold text-[var(--ink-muted)]">
            Пока нет завершённых матчей с твоим участием.
          </p>
        )}
      </div>
    </main>
  )
}
