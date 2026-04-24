import type { AppSupabaseClient } from '@/lib/supabaseClient'
import type { Match, Player, Team, Tournament } from '@/lib/types'
import { isPlayoffBracketMatch } from '@/lib/stats'
import { isDoublesParticipantType } from '@/lib/participantType'

export function normalizeTeamRow(r: Record<string, unknown>): Team {
  return {
    id: Number(r.id),
    tournament_id: Number(r.tournament_id),
    player_1_id: Number(r.player_1_id),
    player_2_id: Number(r.player_2_id),
    name:
      typeof r.name === 'string' && r.name.trim().length > 0
        ? r.name.trim()
        : null,
    sort_index: Number(r.sort_index ?? 0),
  }
}

export function autoTeamName(team: Pick<Team, 'player_1_id' | 'player_2_id'>, players: Player[]): string {
  const byId = new Map(players.map((p) => [Number(p.id), p]))
  const p1 = byId.get(Number(team.player_1_id))
  const p2 = byId.get(Number(team.player_2_id))
  if (!p1 || !p2) {
    return `${team.player_1_id} / ${team.player_2_id}`
  }
  return `${p1.name} / ${p2.name}`
}

export function teamDisplayName(
  team: Pick<Team, 'player_1_id' | 'player_2_id' | 'name'>,
  players: Player[]
): string {
  const custom = typeof team.name === 'string' ? team.name.trim() : ''
  return custom || autoTeamName(team, players)
}

export function getTournamentPlayerIdsFromTeams(teams: Team[]): number[] {
  const seen = new Set<number>()
  const ordered: number[] = []
  const sorted = [...teams].sort((a, b) => a.sort_index - b.sort_index)
  for (const team of sorted) {
    for (const pid of [team.player_1_id, team.player_2_id]) {
      const id = Number(pid)
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
    }
  }
  return ordered
}

export function findTeamByPlayers(
  teams: Team[],
  player1Id: number | null | undefined,
  player2Id: number | null | undefined
): Team | null {
  if (player1Id == null || player2Id == null) return null
  const a = Number(player1Id)
  const b = Number(player2Id)
  for (const team of teams) {
    const t1 = Number(team.player_1_id)
    const t2 = Number(team.player_2_id)
    if ((t1 === a && t2 === b) || (t1 === b && t2 === a)) {
      return team
    }
  }
  return null
}

export async function fetchTournamentTeams(
  supabase: AppSupabaseClient,
  tournamentId: number
): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_index', { ascending: true })
  if (error) {
    console.warn('[fetchTournamentTeams]', error)
    return []
  }
  return (data ?? []).map((r) => normalizeTeamRow(r as Record<string, unknown>))
}

/** Матчи «нижнего» раунда сетки (первый раунд плей-офф): всего size/2 матчей. */
export function getPlayoffLeafRoundMatches(matches: Match[]): Match[] {
  const br = matches.filter(isPlayoffBracketMatch)
  if (br.length === 0) return []
  const minRi = Math.min(...br.map((m) => m.round_index))
  return br
    .filter((m) => m.round_index === minRi)
    .sort((a, b) => a.bracket_order - b.bracket_order)
}

/**
 * Команда i (0-based) = матч i: сторона A = команда 2i, сторона B = команда 2i+1.
 * Нужно ровно bracketSize команд и столько же матчей в первом раунде (= bracketSize/2).
 */
export function canApplyTeamsToPlayoffR1(
  tournament: Tournament,
  teams: Team[],
  matches: Match[]
): string | null {
  if (tournament.format !== 'playoff' || !isDoublesParticipantType(tournament.participant_type)) {
    return 'Доступно только для парного плей-офф.'
  }
  const size = tournament.playoff_bracket_size
  if (size !== 4 && size !== 8 && size !== 16) {
    return 'Размер сетки 4, 8 или 16.'
  }
  if (teams.length !== size) {
    return `Нужно ровно ${size} команд, сейчас ${teams.length}.`
  }
  const leaf = getPlayoffLeafRoundMatches(matches)
  if (leaf.length !== size / 2) {
    return `Ожидается ${size / 2} матчей в первом раунде сетки, в БД: ${leaf.length}.`
  }
  return null
}
