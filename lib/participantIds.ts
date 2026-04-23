/** Нормализация participant_ids из БД (jsonb) и клиента. */
export function normalizeParticipantIds(raw: unknown): number[] | null {
  if (raw == null) return null
  let arr: unknown[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return null
      arr = parsed
    } catch {
      return null
    }
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    return null
  }
  const nums = arr
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
  return nums.length ? nums : null
}

export function participantIdSetFromRaw(raw: unknown): Set<number> {
  const ids = normalizeParticipantIds(raw)
  if (!ids) return new Set()
  return new Set(ids)
}
