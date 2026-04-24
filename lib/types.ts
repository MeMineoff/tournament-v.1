export type Group = {
  id: number
  name: string
}

/** Пара (команда) в рамках одного турнира; в другом турнире тот же состав — новая строка. */
export type Team = {
  id: number
  tournament_id: number
  player_1_id: number
  player_2_id: number
  sort_index: number
}

export type Player = {
  id: number
  group_id: number
  name: string
  avatar_emoji: string
}

export type BracketRound =
  | 'round_robin'
  | 'round_of_16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final'

/** Формат турнира в БД. */
export type TournamentFormat = 'round_robin' | 'playoff'

export type Tournament = {
  id: number
  group_id: number
  name: string
  description: string | null
  format: TournamentFormat | string
  participant_type: string
  status: string
  scheduled_date: string
  playoff_bracket_size: number | null
  participant_ids: number[] | null
}

export type Match = {
  id: number
  tournament_id: number
  player_a_id: number | null
  player_a2_id: number | null
  player_b_id: number | null
  player_b2_id: number | null
  score_a: number
  score_b: number
  fun_rating_a: number | null
  fun_rating_b: number | null
  comment: string | null
  status: string
  round: string | null
  bracket_order: number
  round_index: number
  parent_a_match_id: number | null
  parent_b_match_id: number | null
}

export type MatchEnriched = Match & {
  player_a_name: string
  player_b_name: string
  player_a_emoji: string
  player_b_emoji: string
  player_a2_name: string
  player_a2_emoji: string
  player_b2_name: string
  player_b2_emoji: string
}
