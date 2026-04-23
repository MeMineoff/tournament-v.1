export const CLUSTER_COOKIE_NAME = 'fun_cup_cluster_id'

/** Срок хранения cookie — 1 год (секунды). */
export const CLUSTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const CLUSTER_COOKIE_VALUE_ALL = 'all'

export type ClusterSelection = 'all' | number

/** Режим «все кластеры» по умолчанию (главная — анонс всего). */
export function parseClusterSelection(
  groups: { id: number }[],
  raw: string | undefined | null
): ClusterSelection {
  if (
    raw === CLUSTER_COOKIE_VALUE_ALL ||
    raw === undefined ||
    raw === null ||
    raw === ''
  ) {
    return 'all'
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || !groups.some((g) => g.id === n)) {
    return 'all'
  }
  return n
}

/** Для админки и запросов, где нужен один group_id. */
export function resolveConcreteGroupId(
  groups: { id: number }[],
  selection: ClusterSelection
): number | null {
  if (!groups.length) return null
  if (selection === 'all') return groups[0]!.id
  return selection
}

/** @deprecated Используйте parseClusterSelection / resolveConcreteGroupId */
export function resolveGroupId(
  groups: { id: number }[],
  raw: string | undefined | null
): number {
  return resolveConcreteGroupId(groups, parseClusterSelection(groups, raw)) ?? 1
}
