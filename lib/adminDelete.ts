import type { SupabaseClient } from '@supabase/supabase-js'

/** Клиент с `db.schema = 'tournament'` (как в lib/supabaseClient). */
type Db = SupabaseClient<any, 'public', 'tournament'>

/**
 * Удаляет все матчи турнира (с отвязкой parent_* от сетки) и сам турнир.
 */
export async function deleteTournamentCascade(
  supabase: Db,
  tournamentId: number
): Promise<string | null> {
  const { error: u1 } = await supabase
    .from('matches')
    .update({
      parent_a_match_id: null,
      parent_b_match_id: null,
    })
    .eq('tournament_id', tournamentId)
  if (u1) return u1.message

  const { error: d1 } = await supabase
    .from('matches')
    .delete()
    .eq('tournament_id', tournamentId)
  if (d1) return d1.message

  const { error: d2 } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', tournamentId)
  if (d2) return d2.message
  return null
}

/** Все турниры группы, матчи, игроки, строка группы. */
export async function deleteGroupCascade(
  supabase: Db,
  groupId: number
): Promise<string | null> {
  const { data: tours, error: e0 } = await supabase
    .from('tournaments')
    .select('id')
    .eq('group_id', groupId)
  if (e0) return e0.message

  for (const row of tours ?? []) {
    const err = await deleteTournamentCascade(supabase, row.id as number)
    if (err) return err
  }

  const { error: ep } = await supabase
    .from('players')
    .delete()
    .eq('group_id', groupId)
  if (ep) return ep.message

  const { error: eg } = await supabase.from('groups').delete().eq('id', groupId)
  if (eg) return eg.message
  return null
}
