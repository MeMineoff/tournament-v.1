import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { normalizeParticipantIds } from '@/lib/participantIds'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchTournamentTeams,
  findTeamByPlayers,
  teamDisplayName,
} from '@/lib/tournamentTeams'
import type {
  Group,
  Match,
  MatchEnriched,
  Player,
  Tournament,
} from '@/lib/types'
import TournamentView from '@/components/tournament/TournamentView'
import { CLUSTER_COOKIE_NAME, parseClusterSelection } from '@/lib/cluster'
import { computeTournamentArchiveStats } from '@/lib/aggregateStats'
import { tournamentPlayers } from '@/lib/stats'

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

export default async function TournamentPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id: idParam } = await params
  const tournamentId = Number(idParam)
  if (!Number.isFinite(tournamentId)) notFound()

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (tErr || !tournament) notFound()

  const t = normalizeTournament(tournament as Tournament & Record<string, unknown>)

  const [{ data: groupsRaw }, cookieStore] = await Promise.all([
    supabase.from('groups').select('*').order('id'),
    cookies(),
  ])
  const groups = (groupsRaw ?? []) as Group[]
  const clusterSel = parseClusterSelection(
    groups,
    cookieStore.get(CLUSTER_COOKIE_NAME)?.value
  )
  const clusterMismatch =
    clusterSel !== 'all' && t.group_id !== clusterSel
      ? {
          tournamentGroupName:
            groups.find((g) => g.id === t.group_id)?.name ?? `id ${t.group_id}`,
          selectedGroupName:
            groups.find((g) => g.id === clusterSel)?.name ?? `id ${clusterSel}`,
        }
      : undefined

  const [{ data: playersRaw }, { data: matchesRaw }, teams] = await Promise.all([
    supabase
      .from('players')
      .select('*')
      .eq('group_id', t.group_id)
      .order('name'),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_index', { ascending: true })
      .order('bracket_order', { ascending: true }),
    fetchTournamentTeams(supabase, tournamentId),
  ])

  const players = (playersRaw ?? []) as Player[]
  const matches = (matchesRaw ?? []).map((r) => normalizeMatch(r as Record<string, unknown>))

  const byId = new Map(players.map((p) => [p.id, p]))

  const scopePlayers = tournamentPlayers(t, players, teams)
  const archiveStats = computeTournamentArchiveStats(t, scopePlayers, matches)

  const enriched: MatchEnriched[] = matches.map((m) => {
    const pa = m.player_a_id != null ? byId.get(m.player_a_id) : undefined
    const pa2 = m.player_a2_id != null ? byId.get(m.player_a2_id) : undefined
    const pb = m.player_b_id != null ? byId.get(m.player_b_id) : undefined
    const pb2 = m.player_b2_id != null ? byId.get(m.player_b2_id) : undefined
    return {
      ...m,
      player_a_name: pa?.name ?? 'Не назначено',
      player_b_name: pb?.name ?? 'Не назначено',
      player_a_emoji: pa?.avatar_emoji ?? '❔',
      player_b_emoji: pb?.avatar_emoji ?? '❔',
      player_a2_name: pa2?.name ?? '',
      player_a2_emoji: pa2?.avatar_emoji ?? '',
      player_b2_name: pb2?.name ?? '',
      player_b2_emoji: pb2?.avatar_emoji ?? '',
      team_a_name: (() => {
        const team = findTeamByPlayers(teams, m.player_a_id, m.player_a2_id)
        return team ? teamDisplayName(team, players) : null
      })(),
      team_b_name: (() => {
        const team = findTeamByPlayers(teams, m.player_b_id, m.player_b2_id)
        return team ? teamDisplayName(team, players) : null
      })(),
    }
  })

  return (
    <TournamentView
      tournament={t}
      players={players}
      teams={teams}
      matches={enriched}
      clusterMismatch={clusterMismatch}
      archiveStats={archiveStats}
    />
  )
}
