import type { Match, Player, Tournament } from '@/lib/types'
import { computeFunStarsSumLeaderboard, computeStandings } from '@/lib/stats'

export function isPlayerOnSideA(m: Match, playerId: number): boolean {
  return m.player_a_id === playerId || m.player_a2_id === playerId
}

export function isPlayerOnSideB(m: Match, playerId: number): boolean {
  return m.player_b_id === playerId || m.player_b2_id === playerId
}

export function isPlayerInMatch(m: Match, playerId: number): boolean {
  return isPlayerOnSideA(m, playerId) || isPlayerOnSideB(m, playerId)
}

export function matchOutcomeForPlayer(
  m: Match,
  playerId: number
): 'win' | 'loss' | 'draw' | null {
  if (m.status !== 'completed') return null
  if (m.player_a_id == null || m.player_b_id == null) return null
  const a = isPlayerOnSideA(m, playerId)
  const b = isPlayerOnSideB(m, playerId)
  if (!a && !b) return null
  if (m.score_a === m.score_b) return 'draw'
  if (m.score_a > m.score_b) return a ? 'win' : 'loss'
  return b ? 'win' : 'loss'
}

export function funReceivedByPlayerInMatch(
  m: Match,
  playerId: number
): number {
  if (m.fun_rating_a == null && m.fun_rating_b == null) return 0
  let s = 0
  if (m.player_a_id === playerId || m.player_a2_id === playerId) {
    if (m.fun_rating_a != null) s += m.fun_rating_a
  }
  if (m.player_b_id === playerId || m.player_b2_id === playerId) {
    if (m.fun_rating_b != null) s += m.fun_rating_b
  }
  return s
}

export type PlayerCareerStats = {
  totalMatches: number
  wins: number
  losses: number
  draws: number
  tournamentCount: number
  bestTournament: {
    tournament: Tournament
    funSum: number
    wins: number
  } | null
  bestTournamentByWins: {
    tournament: Tournament
    wins: number
    funSum: number
  } | null
}

function funSumForPlayerInTournament(
  playerId: number,
  tourId: number,
  completed: Match[]
): number {
  let sum = 0
  for (const m of completed) {
    if (m.tournament_id !== tourId) continue
    if (!isPlayerInMatch(m, playerId)) continue
    sum += funReceivedByPlayerInMatch(m, playerId)
  }
  return sum
}

function winsInTournament(
  playerId: number,
  tourId: number,
  completed: Match[]
): number {
  let w = 0
  for (const m of completed) {
    if (m.tournament_id !== tourId) continue
    const o = matchOutcomeForPlayer(m, playerId)
    if (o === 'win') w += 1
  }
  return w
}

export function computePlayerCareerStats(
  playerId: number,
  allMatches: Match[],
  tournamentById: Map<number, Tournament>
): PlayerCareerStats {
  const inMatches = allMatches.filter((m) => isPlayerInMatch(m, playerId))
  const completed = inMatches.filter((m) => m.status === 'completed')

  let wins = 0
  let losses = 0
  let draws = 0
  for (const m of completed) {
    const o = matchOutcomeForPlayer(m, playerId)
    if (o === 'win') wins += 1
    else if (o === 'loss') losses += 1
    else if (o === 'draw') draws += 1
  }

  const tids = new Set(
    completed.map((m) => m.tournament_id).filter((x) => Number.isFinite(x))
  )
  const tournamentCount = tids.size

  type Row = { tid: number; funSum: number; wins: number; t: Tournament }
  const rows: Row[] = []
  for (const tid of tids) {
    const t = tournamentById.get(tid)
    if (!t) continue
    const fs = funSumForPlayerInTournament(playerId, tid, completed)
    const w = winsInTournament(playerId, tid, completed)
    rows.push({ tid, funSum: fs, wins: w, t })
  }

  if (rows.length === 0) {
    return {
      totalMatches: completed.length,
      wins,
      losses,
      draws,
      tournamentCount: 0,
      bestTournament: null,
      bestTournamentByWins: null,
    }
  }

  const byFun = [...rows].sort((a, b) => {
    if (b.funSum !== a.funSum) return b.funSum - a.funSum
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.t.name.localeCompare(b.t.name)
  })
  const byW = [...rows].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.funSum !== a.funSum) return b.funSum - a.funSum
    return a.t.name.localeCompare(b.t.name)
  })

  const topFun = byFun[0]
  const topW = byW[0]
  const bestTournament = {
    tournament: topFun.t,
    funSum: topFun.funSum,
    wins: topFun.wins,
  }
  const bestTournamentByWins =
    topW.tid === topFun.tid
      ? null
      : {
          tournament: topW.t,
          wins: topW.wins,
          funSum: topW.funSum,
        }

  return {
    totalMatches: completed.length,
    wins,
    losses,
    draws,
    tournamentCount,
    bestTournament,
    bestTournamentByWins,
  }
}

export type StarHistogram = { 1: number; 2: number; 3: number; 4: number; 5: number }

/** Каждая непустая оценка fun_rating_a / fun_rating_b отдельно (1–5). */
export function computeFunStarHistogram(matches: Match[]): StarHistogram {
  const h: StarHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const m of matches) {
    if (m.status !== 'completed') continue
    for (const v of [m.fun_rating_a, m.fun_rating_b]) {
      if (v == null) continue
      const n = Math.round(Number(v))
      if (n >= 1 && n <= 5) h[n as keyof StarHistogram] += 1
    }
  }
  return h
}

export type TournamentArchiveStats = {
  participantCount: number
  matchCount: number
  completedMatchCount: number
  topFunPlayer: Player & { funSum: number; funCount: number } | null
  topPointsPlayer: StandingRowWithFun | null
  starHistogram: StarHistogram
}

type StandingRowWithFun = Player & {
  played: number
  wins: number
  points: number
  funSum: number
}

export function computeTournamentArchiveStats(
  tournament: Tournament,
  players: Player[],
  matches: Match[]
): TournamentArchiveStats {
  const ids = tournament.participant_ids ?? []
  const participantCount = ids.length
  const completed = matches.filter((m) => m.status === 'completed')
  const matchCount = matches.length
  const completedMatchCount = completed.length

  const funRows = computeFunStarsSumLeaderboard(players, completed)
  const topFunPlayer = funRows.find((r) => r.funSum > 0) ?? null

  const st = computeStandings(players, completed)
  const frMap = new Map(
    funRows.map((r) => [r.id, { fun: r.funSum, fc: r.funCount }])
  )
  const combined: StandingRowWithFun[] = st.map((row) => ({
    ...row,
    funSum: frMap.get(row.id)?.fun ?? 0,
  }))
  const topPointsPlayer =
    completed.length > 0 && combined.length > 0
      ? [...combined].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points
          if (b.wins !== a.wins) return b.wins - a.wins
          if (b.funSum !== a.funSum) return b.funSum - a.funSum
          return a.name.localeCompare(b.name)
        })[0]!
      : null

  return {
    participantCount,
    matchCount,
    completedMatchCount,
    topFunPlayer: topFunPlayer,
    topPointsPlayer,
    starHistogram: computeFunStarHistogram(completed),
  }
}

export type TournamentFunRank = {
  tournament: Tournament
  totalFun: number
  completedMatches: number
  avgPerMatch: number
}

export function rankTournamentsByFun(
  tournaments: Tournament[],
  allMatches: Match[]
): TournamentFunRank[] {
  const byTid = new Map<number, { total: number; n: number }>()
  for (const t of tournaments) {
    byTid.set(t.id, { total: 0, n: 0 })
  }
  for (const m of allMatches) {
    if (m.status !== 'completed') continue
    const cell = byTid.get(m.tournament_id)
    if (!cell) continue
    const a = m.fun_rating_a != null ? m.fun_rating_a : 0
    const b = m.fun_rating_b != null ? m.fun_rating_b : 0
    cell.total += a + b
    cell.n += 1
  }
  return tournaments
    .map((t) => {
      const c = byTid.get(t.id) ?? { total: 0, n: 0 }
      return {
        tournament: t,
        totalFun: c.total,
        completedMatches: c.n,
        avgPerMatch: c.n > 0 ? c.total / c.n : 0,
      }
    })
    .sort((a, b) => {
      if (b.totalFun !== a.totalFun) return b.totalFun - a.totalFun
      if (b.avgPerMatch !== a.avgPerMatch) return b.avgPerMatch - a.avgPerMatch
      return a.tournament.name.localeCompare(b.tournament.name)
    })
}

export type ClusterSummaryStats = {
  completedMatchCount: number
  tournamentCount: number
  topFunPlayer: Player & { funSum: number; funCount: number } | null
  top3Tournaments: TournamentFunRank[]
}

export function computeClusterSummaryStats(
  tournaments: Tournament[],
  clusterPlayers: Player[],
  clusterMatches: Match[]
): ClusterSummaryStats {
  const completed = clusterMatches.filter((m) => m.status === 'completed')
  const allFun = computeFunStarsSumLeaderboard(clusterPlayers, completed)
  const topFunPlayer = allFun.find((r) => r.funSum > 0) ?? null

  const top3Tournaments = rankTournamentsByFun(tournaments, completed)
    .filter((r) => r.totalFun > 0)
    .slice(0, 3)

  return {
    completedMatchCount: completed.length,
    tournamentCount: tournaments.length,
    topFunPlayer: topFunPlayer ?? null,
    top3Tournaments,
  }
}
