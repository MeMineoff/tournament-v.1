import type { Match } from '@/lib/types'

export function normalizeMatchRow(row: Record<string, unknown>): Match {
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
