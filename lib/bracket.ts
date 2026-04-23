import type { BracketRound } from '@/lib/types'

export type BracketMatchInsert = {
  tournament_id: number
  player_a_id: number | null
  player_a2_id: number | null
  player_b_id: number | null
  player_b2_id: number | null
  score_a: number
  score_b: number
  status: string
  round: BracketRound
  round_index: number
  bracket_order: number
  parent_a_match_id: number | null
  parent_b_match_id: number | null
}

type TierRow = {
  round: BracketRound
  round_index: number
  bracket_order: number
  parent_a_local?: number
  parent_b_local?: number
}

function tierForSize(size: 4 | 8 | 16): TierRow[][] {
  if (size === 4) {
    return [
      [
        { round: 'semifinal', round_index: 1, bracket_order: 0 },
        { round: 'semifinal', round_index: 1, bracket_order: 1 },
      ],
      [
        {
          round: 'final',
          round_index: 2,
          bracket_order: 0,
          parent_a_local: 0,
          parent_b_local: 1,
        },
      ],
    ]
  }
  if (size === 8) {
    return [
      [
        { round: 'quarterfinal', round_index: 1, bracket_order: 0 },
        { round: 'quarterfinal', round_index: 1, bracket_order: 1 },
        { round: 'quarterfinal', round_index: 1, bracket_order: 2 },
        { round: 'quarterfinal', round_index: 1, bracket_order: 3 },
      ],
      [
        {
          round: 'semifinal',
          round_index: 2,
          bracket_order: 0,
          parent_a_local: 0,
          parent_b_local: 1,
        },
        {
          round: 'semifinal',
          round_index: 2,
          bracket_order: 1,
          parent_a_local: 2,
          parent_b_local: 3,
        },
      ],
      [
        {
          round: 'final',
          round_index: 3,
          bracket_order: 0,
          parent_a_local: 0,
          parent_b_local: 1,
        },
      ],
    ]
  }
  return [
    Array.from({ length: 8 }, (_, i) => ({
      round: 'round_of_16' as const,
      round_index: 1,
      bracket_order: i,
    })),
    [
      {
        round: 'quarterfinal' as const,
        round_index: 2,
        bracket_order: 0,
        parent_a_local: 0,
        parent_b_local: 1,
      },
      {
        round: 'quarterfinal' as const,
        round_index: 2,
        bracket_order: 1,
        parent_a_local: 2,
        parent_b_local: 3,
      },
      {
        round: 'quarterfinal' as const,
        round_index: 2,
        bracket_order: 2,
        parent_a_local: 4,
        parent_b_local: 5,
      },
      {
        round: 'quarterfinal' as const,
        round_index: 2,
        bracket_order: 3,
        parent_a_local: 6,
        parent_b_local: 7,
      },
    ],
    [
      {
        round: 'semifinal' as const,
        round_index: 3,
        bracket_order: 0,
        parent_a_local: 0,
        parent_b_local: 1,
      },
      {
        round: 'semifinal' as const,
        round_index: 3,
        bracket_order: 1,
        parent_a_local: 2,
        parent_b_local: 3,
      },
    ],
    [
      {
        round: 'final' as const,
        round_index: 4,
        bracket_order: 0,
        parent_a_local: 0,
        parent_b_local: 1,
      },
    ],
  ]
}

/**
 * Плей-офф: пустая сетка (все player_* = NULL). Одиночки и пары — одна и та же структура строк.
 * `participant_type` зарезервирован для совместимости API; на разметку сетки не влияет.
 */
export function buildPlayoffBracketSkeleton(
  tournamentId: number,
  playoffBracketSize: 4 | 8 | 16,
  _participantType: string
): {
  rows: BracketMatchInsert[]
  parentLinks: { a: number | null; b: number | null }[]
} {
  void _participantType
  const size = playoffBracketSize
  const tiers = tierForSize(size)
  const rows: BracketMatchInsert[] = []
  const parentLinks: { a: number | null; b: number | null }[] = []

  const tierOffsets: number[] = []
  let run = 0
  for (const tier of tiers) {
    tierOffsets.push(run)
    run += tier.length
  }

  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti]!
    const prevOffset = ti > 0 ? tierOffsets[ti - 1]! : null

    for (let mi = 0; mi < tier.length; mi++) {
      const row = tier[mi]!
      let pa: number | null = null
      let pb: number | null = null
      if (
        row.parent_a_local != null &&
        row.parent_b_local != null &&
        prevOffset != null
      ) {
        pa = prevOffset + row.parent_a_local
        pb = prevOffset + row.parent_b_local
      }

      parentLinks.push({ a: pa, b: pb })
      rows.push({
        tournament_id: tournamentId,
        player_a_id: null,
        player_a2_id: null,
        player_b_id: null,
        player_b2_id: null,
        score_a: 0,
        score_b: 0,
        status: 'scheduled',
        round: row.round,
        round_index: row.round_index,
        bracket_order: row.bracket_order,
        parent_a_match_id: null,
        parent_b_match_id: null,
      })
    }
  }

  return { rows, parentLinks }
}

export function tierSizesForBracket(size: 4 | 8 | 16): number[] {
  if (size === 4) return [2, 1]
  if (size === 8) return [4, 2, 1]
  return [8, 4, 2, 1]
}
