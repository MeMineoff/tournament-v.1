import type { Match, Player, Team, Tournament } from '@/lib/types'
import { isDoublesParticipantType } from '@/lib/participantType'
import { getTournamentPlayerIdsFromTeams } from '@/lib/tournamentTeams'

export type FunRow = Player & { funAvg: number | null; funCount: number }

export type StandingRow = Player & {
  played: number
  wins: number
  points: number
}

/**
 * Матчи кругового этапа. Плей-офф (любой round кроме round_robin, родители в сетке,
 * round_index > 0) сюда не попадает — иначе дублирование со сеткой.
 */
export function isRoundRobinMatch(m: Match): boolean {
  if (m.round === 'round_robin') return true
  if (m.round != null && m.round !== '' && m.round !== 'round_robin') return false
  if (m.parent_a_match_id != null || m.parent_b_match_id != null) return false
  if (m.round_index > 0) return false
  return true
}

/** Матчи визуальной сетки плей-офф (всё, что не круг). */
export function isPlayoffBracketMatch(m: Match): boolean {
  return !isRoundRobinMatch(m)
}

export function matchesForGroupTable(
  tournament: Tournament,
  matches: Match[]
): Match[] {
  if (tournament.format === 'playoff') {
    return []
  }
  return matches.filter(isRoundRobinMatch)
}

export function tournamentPlayers(
  tournament: Tournament,
  allGroupPlayers: Player[],
  teams: Team[] = []
): Player[] {
  const ids =
    isDoublesParticipantType(tournament.participant_type) && teams.length > 0
      ? getTournamentPlayerIdsFromTeams(teams)
      : tournament.participant_ids
  if (!ids || ids.length === 0) return []
  const set = new Set(ids.map((x) => Number(x)))
  return allGroupPlayers.filter((p) => set.has(Number(p.id)))
}

export function computeFunLeaderboard(
  players: Player[],
  matches: Match[]
): FunRow[] {
  const sums = new Map<number, { sum: number; count: number }>()
  for (const p of players) sums.set(p.id, { sum: 0, count: 0 })

  for (const m of matches) {
    if (m.fun_rating_a != null && m.player_a_id != null) {
      const s = sums.get(m.player_a_id)
      if (!s) continue
      s.sum += m.fun_rating_a
      s.count += 1
      if (m.player_a2_id != null) {
        const s2 = sums.get(m.player_a2_id)
        if (s2) {
          s2.sum += m.fun_rating_a
          s2.count += 1
        }
      }
    }
    if (m.fun_rating_b != null && m.player_b_id != null) {
      const s = sums.get(m.player_b_id)
      if (!s) continue
      s.sum += m.fun_rating_b
      s.count += 1
      if (m.player_b2_id != null) {
        const s2 = sums.get(m.player_b2_id)
        if (s2) {
          s2.sum += m.fun_rating_b
          s2.count += 1
        }
      }
    }
  }

  return players
    .map((p) => {
      const s = sums.get(p.id)!
      const funAvg = s.count > 0 ? s.sum / s.count : null
      return { ...p, funAvg, funCount: s.count }
    })
    .sort((a, b) => {
      if (a.funAvg == null && b.funAvg == null) return a.name.localeCompare(b.name)
      if (a.funAvg == null) return 1
      if (b.funAvg == null) return -1
      if (b.funAvg !== a.funAvg) return b.funAvg - a.funAvg
      return a.name.localeCompare(b.name)
    })
}

/** Сумма всех звёзд FUN по завершённым матчам (для вкладки FUN на странице турнира). */
export type FunSumRow = Player & { funSum: number; funCount: number }

export function computeFunStarsSumLeaderboard(
  players: Player[],
  matches: Match[]
): FunSumRow[] {
  const sums = new Map<number, { sum: number; count: number }>()
  for (const p of players) sums.set(p.id, { sum: 0, count: 0 })

  for (const m of matches) {
    if (m.fun_rating_a != null && m.player_a_id != null) {
      const s = sums.get(m.player_a_id)
      if (!s) continue
      s.sum += m.fun_rating_a
      s.count += 1
      if (m.player_a2_id != null) {
        const s2 = sums.get(m.player_a2_id)
        if (s2) {
          s2.sum += m.fun_rating_a
          s2.count += 1
        }
      }
    }
    if (m.fun_rating_b != null && m.player_b_id != null) {
      const s = sums.get(m.player_b_id)
      if (!s) continue
      s.sum += m.fun_rating_b
      s.count += 1
      if (m.player_b2_id != null) {
        const s2 = sums.get(m.player_b2_id)
        if (s2) {
          s2.sum += m.fun_rating_b
          s2.count += 1
        }
      }
    }
  }

  return players
    .map((p) => {
      const s = sums.get(p.id)!
      return { ...p, funSum: s.sum, funCount: s.count }
    })
    .sort((a, b) => {
      if (b.funSum !== a.funSum) return b.funSum - a.funSum
      return a.name.localeCompare(b.name)
    })
}

export function computeStandings(
  players: Player[],
  matches: Match[]
): StandingRow[] {
  const map = new Map<number, StandingRow>()
  for (const p of players) {
    map.set(p.id, { ...p, played: 0, wins: 0, points: 0 })
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue
    if (m.player_a_id == null || m.player_b_id == null) continue
    const doubles =
      m.player_a2_id != null && m.player_b2_id != null
    const teamA: number[] = doubles
      ? [m.player_a_id, m.player_a2_id!]
      : [m.player_a_id]
    const teamB: number[] = doubles
      ? [m.player_b_id, m.player_b2_id!]
      : [m.player_b_id]
    const rowsA = teamA
      .map((id) => map.get(id))
      .filter((x): x is StandingRow => x != null)
    const rowsB = teamB
      .map((id) => map.get(id))
      .filter((x): x is StandingRow => x != null)
    if (rowsA.length !== teamA.length || rowsB.length !== teamB.length) continue
    for (const r of rowsA) r.played += 1
    for (const r of rowsB) r.played += 1
    if (m.score_a > m.score_b) {
      for (const r of rowsA) {
        r.wins += 1
        r.points += 3
      }
    } else if (m.score_b > m.score_a) {
      for (const r of rowsB) {
        r.wins += 1
        r.points += 3
      }
    } else {
      for (const r of rowsA) r.points += 1
      for (const r of rowsB) r.points += 1
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.name.localeCompare(b.name)
  })
}

export type StandingFunRow = StandingRow & { funSum: number }

/** Турнирная таблица + сумма звёзд FUN по матчам из `matches`. */
export function computeStandingsWithFun(
  players: Player[],
  matches: Match[]
): StandingFunRow[] {
  const standings = computeStandings(players, matches)
  const funById = new Map(
    computeFunStarsSumLeaderboard(players, matches).map((r) => [r.id, r.funSum])
  )
  return standings.map((row) => ({
    ...row,
    funSum: funById.get(row.id) ?? 0,
  }))
}
