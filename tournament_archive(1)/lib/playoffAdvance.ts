import { supabase } from '@/lib/supabaseClient'
import type { Match } from '@/lib/types'

/** Одиночный: один id; пара: оба id (второй может быть null только если битый матч). */
export function winnerPlayerId(m: Pick<
  Match,
  | 'status'
  | 'player_a_id'
  | 'player_a2_id'
  | 'player_b_id'
  | 'player_b2_id'
  | 'score_a'
  | 'score_b'
>): number | null {
  if (m.status !== 'completed') return null
  if (m.player_a_id == null || m.player_b_id == null) return null
  if (m.score_a > m.score_b) return m.player_a_id
  if (m.score_b > m.score_a) return m.player_b_id
  return null
}

type Side = { id: number; id2: number | null }

function winningSide(m: Match): Side | null {
  if (m.status !== 'completed') return null
  if (m.player_a_id == null || m.player_b_id == null) return null
  const doubles =
    m.player_a2_id != null && m.player_b2_id != null
  if (m.score_a > m.score_b) {
    return { id: m.player_a_id, id2: doubles ? m.player_a2_id! : null }
  }
  if (m.score_b > m.score_a) {
    return { id: m.player_b_id, id2: doubles ? m.player_b2_id! : null }
  }
  return null
}

/** После завершения матча подставляет победителя (или пару) в следующий раунд сетки. */
export async function propagatePlayoffWinner(completedMatchId: number) {
  const { data: m, error: fe } = await supabase
    .from('matches')
    .select('*')
    .eq('id', completedMatchId)
    .single()

  if (fe || !m) return
  const row = m as Match
  const side = winningSide(row)
  if (side == null) return

  const mid = Number(completedMatchId)

  const { data: children, error: ce } = await supabase
    .from('matches')
    .select('id, parent_a_match_id, parent_b_match_id')
    .or(`parent_a_match_id.eq.${mid},parent_b_match_id.eq.${mid}`)

  if (ce || !children?.length) return

  for (const ch of children) {
    const patch: {
      player_a_id?: number
      player_a2_id?: number | null
      player_b_id?: number
      player_b2_id?: number | null
    } = {}
    if (Number(ch.parent_a_match_id) === mid) {
      patch.player_a_id = side.id
      patch.player_a2_id = side.id2
    }
    if (Number(ch.parent_b_match_id) === mid) {
      patch.player_b_id = side.id
      patch.player_b2_id = side.id2
    }
    if (Object.keys(patch).length === 0) continue
    await supabase.from('matches').update(patch).eq('id', ch.id)
  }
}
