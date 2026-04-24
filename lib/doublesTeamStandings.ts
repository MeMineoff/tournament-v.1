import { normalizeParticipantIds } from '@/lib/participantIds'
import type { Match, Player } from '@/lib/types'
import { isRoundRobinMatch } from '@/lib/stats'

/** Два подряд id в participant_ids = одна пара (как в админке). */
export function chunkPairsFromParticipantIds(
  raw: unknown
): [number, number][] {
  const ids = normalizeParticipantIds(raw)
  if (!ids || ids.length < 2 || ids.length % 2 !== 0) return []
  const out: [number, number][] = []
  for (let i = 0; i < ids.length; i += 2) {
    out.push([ids[i]!, ids[i + 1]!])
  }
  return out
}

export type DoublesTeamStandingRow = {
  teamIndex: number
  playerA: Player
  playerB: Player
  played: number
  wins: number
  points: number
}

/**
 * Турнирная таблица круга для пар: одна строка = одна пара.
 * Состав пар берётся из `participant_ids` (чётная длина, попарно).
 */
export function computeDoublesTeamRoundRobinStandings(
  players: Player[],
  matches: Match[],
  pairs: [number, number][]
): DoublesTeamStandingRow[] {
  if (pairs.length === 0) return []
  const byId = new Map(players.map((p) => [p.id, p]))
  const idToTeam = new Map<number, number>()
  pairs.forEach((pair, ti) => {
    idToTeam.set(pair[0], ti)
    idToTeam.set(pair[1], ti)
  })
  const rows: DoublesTeamStandingRow[] = []
  for (let teamIndex = 0; teamIndex < pairs.length; teamIndex++) {
    const [ida, idb] = pairs[teamIndex]!
    const pa = byId.get(ida)
    const pb = byId.get(idb)
    if (!pa || !pb) continue
    rows.push({
      teamIndex,
      playerA: pa,
      playerB: pb,
      played: 0,
      wins: 0,
      points: 0,
    })
  }
  for (const m of matches) {
    if (m.status !== 'completed' || !isRoundRobinMatch(m)) continue
    if (m.player_a_id == null || m.player_b_id == null) continue
    if (m.player_a2_id == null || m.player_b2_id == null) continue
    const ta = idToTeam.get(m.player_a_id)
    const ta2 = idToTeam.get(m.player_a2_id)
    if (ta == null || ta !== ta2) continue
    const tb = idToTeam.get(m.player_b_id)
    const tb2 = idToTeam.get(m.player_b2_id)
    if (tb == null || tb !== tb2) continue
    const A = rows[ta]
    const B = rows[tb]
    if (!A || !B) continue
    A.played += 1
    B.played += 1
    if (m.score_a > m.score_b) {
      A.wins += 1
      A.points += 3
    } else if (m.score_b > m.score_a) {
      B.wins += 1
      B.points += 3
    } else {
      A.points += 1
      B.points += 1
    }
  }
  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    const na = `${a.playerA.name} + ${a.playerB.name}`
    const nb = `${b.playerA.name} + ${b.playerB.name}`
    return na.localeCompare(nb, 'ru')
  })
}
