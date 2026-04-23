import type { BracketRound } from '@/lib/types'

/** Индексы игроков (0..n-1) в порядке посева — олимпийская сетка, первый раунд. */
export function firstRoundIndexPairs(size: 4 | 8 | 16): [number, number][] {
  if (size === 4) return [[0, 3], [1, 2]]
  if (size === 8) return [[0, 7], [3, 4], [2, 5], [1, 6]]
  return [
    [0, 15],
    [7, 8],
    [4, 11],
    [3, 12],
    [2, 13],
    [5, 10],
    [6, 9],
    [1, 14],
  ]
}

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

/** Одна команда (пара) при опциональном посеве в админке — только для participant_ids. */
export type PlayoffDoublesTeam = {
  id: number
  player_1_id: number
  player_2_id: number
}

export type PlayoffBracketSeed = { mode: 'singles'; playerIds: number[] }

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

export function buildPlayoffBracketPlan(
  tournamentId: number,
  size: 4 | 8 | 16,
  seed: PlayoffBracketSeed
): {
  rows: BracketMatchInsert[]
  parentLinks: { a: number | null; b: number | null }[]
} {
  if (seed.playerIds.length !== size) {
    throw new Error('Число игроков должно совпадать с размером сетки')
  }

  const pairs = firstRoundIndexPairs(size)
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
      let player_a_id: number | null = null
      let player_a2_id: number | null = null
      let player_b_id: number | null = null
      let player_b2_id: number | null = null

      if (ti === 0) {
        const [ia, ib] = pairs[mi]!
        player_a_id = seed.playerIds[ia] ?? null
        player_b_id = seed.playerIds[ib] ?? null
      }

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
        player_a_id,
        player_a2_id,
        player_b_id,
        player_b2_id,
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

/**
 * Парный плей-офф: только «скелет» сетки (round, bracket_order, parent-связи после insert).
 * Игроки назначаются позже в админке или в модалке матча.
 */
export function buildPlayoffDoublesBracketSkeleton(
  tournamentId: number,
  size: 4 | 8 | 16
): {
  rows: BracketMatchInsert[]
  parentLinks: { a: number | null; b: number | null }[]
} {
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

export function roundRobinPairs(playerIds: number[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      out.push([playerIds[i], playerIds[j]])
    }
  }
  return out
}

/** Мини-плей-офф после круга: 2 игрока — финал; 4 игрока — 1/2 + финал. */
export function buildMixedPlayoffPlan(
  tournamentId: number,
  advancers: 2 | 4,
  rankedPlayerIds: number[]
): {
  rows: BracketMatchInsert[]
  parentLinks: { a: number | null; b: number | null }[]
} {
  if (advancers === 2) {
    const [a, b] = rankedPlayerIds
    return {
      rows: [
        {
          tournament_id: tournamentId,
          player_a_id: a ?? null,
          player_a2_id: null,
          player_b_id: b ?? null,
          player_b2_id: null,
          score_a: 0,
          score_b: 0,
          status: 'scheduled',
          round: 'final',
          round_index: 1,
          bracket_order: 0,
          parent_a_match_id: null,
          parent_b_match_id: null,
        },
      ],
      parentLinks: [{ a: null, b: null }],
    }
  }
  const [s1, s2, s3, s4] = rankedPlayerIds
  const rows: BracketMatchInsert[] = [
    {
      tournament_id: tournamentId,
      player_a_id: s1 ?? null,
      player_a2_id: null,
      player_b_id: s4 ?? null,
      player_b2_id: null,
      score_a: 0,
      score_b: 0,
      status: 'scheduled',
      round: 'semifinal',
      round_index: 1,
      bracket_order: 0,
      parent_a_match_id: null,
      parent_b_match_id: null,
    },
    {
      tournament_id: tournamentId,
      player_a_id: s2 ?? null,
      player_a2_id: null,
      player_b_id: s3 ?? null,
      player_b2_id: null,
      score_a: 0,
      score_b: 0,
      status: 'scheduled',
      round: 'semifinal',
      round_index: 1,
      bracket_order: 1,
      parent_a_match_id: null,
      parent_b_match_id: null,
    },
    {
      tournament_id: tournamentId,
      player_a_id: null,
      player_a2_id: null,
      player_b_id: null,
      player_b2_id: null,
      score_a: 0,
      score_b: 0,
      status: 'scheduled',
      round: 'final',
      round_index: 2,
      bracket_order: 0,
      parent_a_match_id: null,
      parent_b_match_id: null,
    },
  ]
  return {
    rows,
    parentLinks: [
      { a: null, b: null },
      { a: null, b: null },
      { a: 0, b: 1 },
    ],
  }
}

export function tierSizesForBracket(size: 4 | 8 | 16): number[] {
  if (size === 4) return [2, 1]
  if (size === 8) return [4, 2, 1]
  return [8, 4, 2, 1]
}
