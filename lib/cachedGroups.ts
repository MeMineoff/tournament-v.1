import { cache } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { Group } from '@/lib/types'

/**
 * Один запрос `groups` на RSC-запрос: layout + главная раньше дублировали его → лишняя сеть и TTFB.
 */
export const getGroupsForNav = cache(
  async (): Promise<{ groups: Group[]; error: PostgrestError | null }> => {
    const { data, error } = await supabase.from('groups').select('*').order('id')
    return { groups: (data ?? []) as Group[], error }
  }
)
