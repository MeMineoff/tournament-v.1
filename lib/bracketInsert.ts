import { supabase } from '@/lib/supabaseClient'
import type { BracketMatchInsert } from '@/lib/bracket'

/**
 * Вставка сетки по уровням: parentLinks[i].a / .b — индексы в общем массиве rows
 * (0…n-1), совпадающие с порядком накопления id в insertedIds после каждого insert.
 *
 * Важно: при RLS в Supabase часто разрешён INSERT, но SELECT по только что вставленным
 * строкам — нет. Тогда `.insert(...).select('id')` возвращает []. Без id следующий
 * уровень получает parent_a_match_id = null и сетка «пустая». Поэтому после вставки
 * при неполном ответе делаем повторный SELECT по tournament_id + round_index +
 * bracket_order.
 */
export async function insertBracketInTiers(
  rows: BracketMatchInsert[],
  parentLinks: { a: number | null; b: number | null }[],
  tierCounts: number[]
): Promise<void> {
  let offset = 0
  const insertedIds: number[] = []

  for (const count of tierCounts) {
    const slice = rows.slice(offset, offset + count)
    const withParents = slice.map((row, i) => {
      const gi = offset + i
      const link = parentLinks[gi]!
      const pa =
        link.a != null ? insertedIds[link.a] : undefined
      const pb =
        link.b != null ? insertedIds[link.b] : undefined
      if (link.a != null && pa == null) {
        throw new Error(
          `Сетка: нет id родительского матча по индексу ${link.a} (уровень вставки). Проверьте RLS: после INSERT в matches должны возвращаться или читаться строки.`
        )
      }
      if (link.b != null && pb == null) {
        throw new Error(
          `Сетка: нет id родительского матча по индексу ${link.b} (уровень вставки). Проверьте RLS: после INSERT в matches должны возвращаться или читаться строки.`
        )
      }
      return {
        tournament_id: row.tournament_id,
        player_a_id: row.player_a_id,
        player_a2_id: row.player_a2_id,
        player_b_id: row.player_b_id,
        player_b2_id: row.player_b2_id,
        score_a: row.score_a,
        score_b: row.score_b,
        status: row.status,
        round: row.round,
        round_index: row.round_index,
        bracket_order: row.bracket_order,
        parent_a_match_id: pa ?? null,
        parent_b_match_id: pb ?? null,
      }
    })

    const tid = withParents[0]!.tournament_id
    const roundIndex = withParents[0]!.round_index
    const bracketOrders = withParents.map((r) => r.bracket_order)

    const { data, error } = await supabase
      .from('matches')
      .insert(withParents)
      .select('id, bracket_order')

    if (error) throw error

    let tierIds: number[]
    if (data && data.length === withParents.length) {
      tierIds = [...data]
        .sort(
          (a, b) => Number(a.bracket_order) - Number(b.bracket_order)
        )
        .map((d) => Number(d.id))
    } else {
      const { data: refetched, error: e2 } = await supabase
        .from('matches')
        .select('id, bracket_order')
        .eq('tournament_id', tid)
        .eq('round_index', roundIndex)
        .in('bracket_order', bracketOrders)
        .order('bracket_order', { ascending: true })

      if (e2) throw e2
      if (!refetched || refetched.length !== withParents.length) {
        throw new Error(
          `Сетка: не удалось получить id матчей уровня (tournament_id=${tid}, round_index=${roundIndex}). ` +
            `insert.select вернул ${data?.length ?? 0} строк из ${withParents.length}; ` +
            `повторный запрос — ${refetched?.length ?? 0}. ` +
            `Частая причина: политики RLS на tournament.matches (нужен SELECT для роли anon/authenticated). ` +
            `Также проверьте колонки player_a2_id / player_b2_id.`
        )
      }
      tierIds = refetched.map((r) => Number(r.id))
    }

    for (const id of tierIds) insertedIds.push(id)
    offset += count
  }
}
