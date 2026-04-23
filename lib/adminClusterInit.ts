import { parseClusterSelection, type ClusterSelection } from '@/lib/cluster'
import type { Group } from '@/lib/types'
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
    }
  }
  const sel = parseClusterSelection(list, rawClusterCookie)
  const [{ data: pRows, error: pE }, { data: tRows, error: tE }] = await Promise.all([
    supabase.from('players').select('group_id'),
    supabase.from('tournaments').select('group_id'),
  ])
  if (pE || tE) {
    const e = pE ?? tE
    return {
      groups: list,
      groupId: list[0]!.id,
      initHint: null,
      dataLoadError: `Проверка кластеров: ${e ? formatG(e) : 'ошибка'}`,
      shouldWriteCookieToGroupId: null,
    }
  }
  const withData = new Set(
    [
      ...(pRows ?? []).map((r) => (r as { group_id: number }).group_id),
      ...(tRows ?? []).map((r) => (r as { group_id: number }).group_id),
    ].filter((id) => id != null)
  )
  const picked = pickGroupIdForAdmin(list, sel, withData)
  if (picked.id === 0) {
    return { groups: list, groupId: null, initHint: null, dataLoadError: null, shouldWriteCookieToGroupId: null }
  }
  if (picked.autoSwitched && picked.toName) {
    return {
      groups: list,
      groupId: picked.id,
      initHint:
        `В шапке был выбран кластер «${picked.fromName ?? '?'}» без игроков и турниров, ` +
        `а на главной при «все кластерах» остальные залы. ` +
        `Открыт «${picked.toName}». Смена: вкладка «Кластеры» → «Выбрать».`,
      dataLoadError: null,
      shouldWriteCookieToGroupId: picked.id,
    }
  }
  return {
    groups: list,
    groupId: picked.id,
    initHint: null,
    dataLoadError: null,
    shouldWriteCookieToGroupId: null,
  }
}
