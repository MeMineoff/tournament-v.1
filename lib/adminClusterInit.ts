import { parseClusterSelection, type ClusterSelection } from '@/lib/cluster'
import type { Group, Player, Tournament } from '@/lib/types'
import type { AppSupabaseClient } from '@/lib/supabaseClient'

function formatG(err: { message: string; details?: string; hint?: string; code?: string }): string {
  const p = [err.message]
  if (err.details) p.push(`Детали: ${err.details}`)
  if (err.hint) p.push(`Подсказка: ${err.hint}`)
  if (err.code) p.push(`Код: ${err.code}`)
  return p.join('\n')
}

/**
 * Как в админке выбрать group_id, чтобы совпадало с тем, что видит главная
 * (тот же смысл cookie, плюс подстановка, если в cookie пустой кластер).
 */
export function pickGroupIdForAdmin(
  list: Group[],
  sel: ClusterSelection,
  withData: Set<number>
): { id: number; autoSwitched: boolean; fromName?: string; toName?: string } {
  if (list.length === 0) {
    return { id: 0, autoSwitched: false }
  }
  const firstWithData = list.find((g) => withData.has(g.id))
  if (sel === 'all') {
    return {
      id: (firstWithData ?? list[0]!).id,
      autoSwitched: false,
    }
  }
  if (withData.has(sel)) {
    return { id: sel, autoSwitched: false }
  }
  if (withData.size === 0) {
    return { id: sel, autoSwitched: false }
  }
  return {
    id: firstWithData!.id,
    autoSwitched: true,
    fromName: list.find((g) => g.id === sel)?.name,
    toName: firstWithData!.name,
  }
}

export type AdminServerInit = {
  groups: Group[]
  groupId: number | null
  initHint: string | null
  dataLoadError: string | null
  /** Если не null, клиенту один раз прописать cookie, чтобы с главной не расходилось */
  shouldWriteCookieToGroupId: number | null
  initialPlayers: Player[]
  initialTournaments: Tournament[]
}

/** Не весь select('group_id') — в PostgREST есть лимит по строкам; по каждой группе — точно. */
export async function buildWithDataSetByCounts(
  supabase: AppSupabaseClient,
  list: Group[]
): Promise<Set<number>> {
  const withData = new Set<number>()
  for (const g of list) {
    const [{ count: pc }, { count: tc }] = await Promise.all([
      supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', g.id),
      supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', g.id),
    ])
    if ((pc ?? 0) > 0 || (tc ?? 0) > 0) {
      withData.add(g.id)
    }
  }
  return withData
}

async function fetchGroupLists(
  supabase: AppSupabaseClient,
  groupId: number
): Promise<{
  players: Player[]
  tournaments: Tournament[]
  error: { message: string } | null
}> {
  const [pRes, tRes] = await Promise.all([
    supabase.from('players').select('*').eq('group_id', groupId).order('name'),
    supabase
      .from('tournaments')
      .select('*')
      .eq('group_id', groupId)
      .order('scheduled_date', { ascending: false }),
  ])
  const err = pRes.error ?? tRes.error
  if (err) {
    return { players: [], tournaments: [], error: err }
  }
  return {
    players: (pRes.data ?? []) as Player[],
    tournaments: (tRes.data ?? []) as Tournament[],
    error: null,
  }
}

/**
 * Те же критерии, что и на главной: `cookies().get` на сервере = один источник правды.
 */
export async function getAdminServerInitial(
  supabase: AppSupabaseClient,
  rawClusterCookie: string | undefined
): Promise<AdminServerInit> {
  const { data: g, error: gErr } = await supabase.from('groups').select('*').order('id')
  if (gErr) {
    return {
      groups: [],
      groupId: null,
      initHint: null,
      dataLoadError: `Кластеры: ${formatG(gErr)}`,
      shouldWriteCookieToGroupId: null,
      initialPlayers: [] as Player[],
      initialTournaments: [] as Tournament[],
    }
  }
  const list = (g ?? []) as Group[]
  if (list.length === 0) {
    return {
      groups: list,
      groupId: null,
      initHint: null,
      dataLoadError: null,
      shouldWriteCookieToGroupId: null,
      initialPlayers: [],
      initialTournaments: [],
    }
  }
  const sel = parseClusterSelection(list, rawClusterCookie)
  let withData: Set<number>
  try {
    withData = await buildWithDataSetByCounts(supabase, list)
  } catch (e) {
    return {
      groups: list,
      groupId: list[0]!.id,
      initHint: null,
      dataLoadError: `Проверка кластеров: ${e instanceof Error ? e.message : String(e)}`,
      shouldWriteCookieToGroupId: null,
      initialPlayers: [],
      initialTournaments: [],
    }
  }
  const picked = pickGroupIdForAdmin(list, sel, withData)
  if (picked.id === 0) {
    return {
      groups: list,
      groupId: null,
      initHint: null,
      dataLoadError: null,
      shouldWriteCookieToGroupId: null,
      initialPlayers: [],
      initialTournaments: [],
    }
  }
  let finalGroupId = picked.id
  let lists = await fetchGroupLists(supabase, finalGroupId)
  if (lists.error) {
    return {
      groups: list,
      groupId: finalGroupId,
      initHint: null,
      dataLoadError: `Игроки/турниры: ${formatG(lists.error as Parameters<typeof formatG>[0])}`,
      shouldWriteCookieToGroupId: null,
      initialPlayers: [],
      initialTournaments: [],
    }
  }
  if (
    lists.players.length === 0 &&
    lists.tournaments.length === 0 &&
    withData.size > 0
  ) {
    for (const g of list) {
      if (g.id === finalGroupId || !withData.has(g.id)) continue
      const alt = await fetchGroupLists(supabase, g.id)
      if (!alt.error && (alt.players.length > 0 || alt.tournaments.length > 0)) {
        finalGroupId = g.id
        lists = alt
        break
      }
    }
  }
  const shouldWrite =
    picked.autoSwitched && picked.toName != null ? finalGroupId : null
  if (picked.autoSwitched && picked.toName) {
    return {
      groups: list,
      groupId: finalGroupId,
      initHint:
        `В шапке был выбран кластер «${picked.fromName ?? '?'}» без игроков и турниров, ` +
        `а на главной при «все кластерах» остальные залы. ` +
        `Открыт «${picked.toName}». Смена: вкладка «Кластеры» → «Выбрать».`,
      dataLoadError: null,
      shouldWriteCookieToGroupId: shouldWrite,
      initialPlayers: lists.players,
      initialTournaments: lists.tournaments,
    }
  }
  return {
    groups: list,
    groupId: finalGroupId,
    initHint: null,
    dataLoadError: null,
    shouldWriteCookieToGroupId: null,
    initialPlayers: lists.players,
    initialTournaments: lists.tournaments,
  }
}
