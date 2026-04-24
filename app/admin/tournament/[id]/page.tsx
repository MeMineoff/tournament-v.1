import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
import { normalizeParticipantIds } from '@/lib/participantIds'
import { supabase } from '@/lib/supabaseClient'
import { fetchTournamentTeams } from '@/lib/tournamentTeams'
import type { Match, Player, Tournament } from '@/lib/types'
import { TournamentAdminForm } from './TournamentAdminForm'

type Params = { id: string }

function normalizeTournament(row: Tournament & Record<string, unknown>): Tournament {
  return {
    ...row,
    playoff_bracket_size: row.playoff_bracket_size ?? null,
    participant_ids: normalizeParticipantIds(row.participant_ids),
  }
}

function normalizePlayerRow(row: Record<string, unknown>): Player {
  return {
    id: Number(row.id),
    group_id: Number(row.group_id),
    name: String(row.name ?? ''),
    avatar_emoji: String(row.avatar_emoji ?? '🎾'),
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

export default async function AdminTournamentPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id: idParam } = await params
  const tournamentId = Number(idParam)
  if (!Number.isFinite(tournamentId)) notFound()

  const { data: tourRaw, error: te } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (te || !tourRaw) notFound()

  const tournament = normalizeTournament(tourRaw as Tournament & Record<string, unknown>)

  const [{ data: playersRaw }, { data: matchesRaw }, teams] = await Promise.all([
    supabase
      .from('players')
      .select('*')
      .eq('group_id', tournament.group_id)
      .order('name'),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_index', { ascending: true })
      .order('bracket_order', { ascending: true }),
    fetchTournamentTeams(supabase, tournamentId),
  ])

  const players = (playersRaw ?? []).map((r) =>
    normalizePlayerRow(r as Record<string, unknown>)
  )
  const matches = (matchesRaw ?? []).map((r) =>
    normalizeMatch(r as Record<string, unknown>)
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/admin"
        className="mb-6 inline-flex text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        ← Назад в админку
      </Link>
      <TournamentAdminForm
        tournament={tournament}
        groupPlayers={players}
        initialMatches={matches}
        initialTeams={teams}
      />
    </main>
  )
}
