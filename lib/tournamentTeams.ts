import type { AppSupabaseClient } from '@/lib/supabaseClient'
import type { Match, Team, Tournament } from '@/lib/types'
import { isPlayoffBracketMatch } from '@/lib/stats'
import { isDoublesParticipantType } from '@/lib/participantType'

export function normalizeTeamRow(r: Record<string, unknown>): Team {
  return {
    id: Number(r.id),
    tournament_id: Number(r.tournament_id),
    player_1_id: Number(r.player_1_id),
    player_2_id: Number(r.player_2_id),
    sort_index: Number(r.sort_index ?? 0),
  }
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
