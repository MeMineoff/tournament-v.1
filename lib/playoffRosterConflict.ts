import type { Match, Tournament } from '@/lib/types'

/** Все назначенные id игроков в матче (только ненулевые). */
export function matchLineupPlayerIds(m: Match): number[] {
  const out: number[] = []
  for (const x of [m.player_a_id, m.player_a2_id, m.player_b_id, m.player_b2_id]) {
    if (x != null && Number.isFinite(Number(x))) out.push(Number(x))
  }
  return out
}

/**
 * Плей-офф: в одном «туре» сетки (один round_index) участник не может играть
 * в двух матчах сразу — иначе можно назначить одних и тех же в соседние пары
 * (вплоть до «сам с собой» по слоту через логическую путаницу).
 */
/** Id игроков, уже задействованных в других матчах того же тура (тот же round_index). */
export function playoffSameRoundBusyElsewhere(
  tournament: Tournament,
  currentMatch: Match | undefined,
  allMatches: Match[]
): Set<number> {
  if (tournament.format !== 'playoff' || !currentMatch) return new Set()
  const tid = currentMatch.tournament_id
  const rIdx = currentMatch.round_index
  const selfId = currentMatch.id
  const used = new Set<number>()
  for (const m of allMatches) {
    if (m.tournament_id !== tid) continue
    if (m.round_index !== rIdx) continue
    if (m.id === selfId) continue
    for (const id of matchLineupPlayerIds(m)) used.add(id)
  }
  return used
}

/** Нельзя выбрать в слоте: id уже занят в соседнем матче; текущее значение слота остаётся доступным. */
export function isPlayoffPlayerDisabledInSelect(
  busyElsewhere: Set<number>,
  currentFieldValue: number | '',
  optionPlayerId: number
): boolean {
  if (!busyElsewhere.has(optionPlayerId)) return false
  if (currentFieldValue !== '' && Number(currentFieldValue) === optionPlayerId)
    return false
  return true
}

export function assertNoPlayoffSameRoundPlayerReuse(
  tournament: Tournament,
  currentMatch: Match,
  proposedPlayerIds: number[],
  allMatches: Match[]
): string | null {
  if (tournament.format !== 'playoff') return null
  const usedElsewhere = playoffSameRoundBusyElsewhere(
    tournament,
    currentMatch,
    allMatches
  )
  for (const id of proposedPlayerIds) {
    if (usedElsewhere.has(id)) {
      return 'Этот игрок уже назначен в другом матче этого же тура сетки. В одном раунде участник не может играть дважды (иначе сетка разъезжается, вплоть до «сам с собой»).'
    }
  }
  return null
}
