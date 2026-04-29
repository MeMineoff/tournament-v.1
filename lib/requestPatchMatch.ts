import type { Match } from '@/lib/types'
import { normalizeMatchRow } from '@/lib/matchRow'

export type PatchMatchResult =
  | { ok: true; match: Match }
  | { ok: false; error: string; hint?: string }

/**
 * Обновление строки матча через /api/admin/matches (elevated key на сервере).
 * Обходит типичные проблемы anon UPDATE (RLS/права) у продакшена.
 */
export async function requestPatchMatch(opts: {
  id: number
  tournamentId: number
  patch: Record<string, unknown>
}): Promise<PatchMatchResult> {
  const url = new URL('/api/admin/matches', window.location.origin).toString()
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      id: opts.id,
      tournament_id: opts.tournamentId,
      patch: opts.patch,
    }),
  })
  const data = (await res.json().catch(() => null)) as
    | { ok: true; match: Record<string, unknown> }
    | { ok: false; error?: string; hint?: string }
    | null

  if (!data) {
    return { ok: false, error: `Пустой ответ сервера (HTTP ${res.status}).` }
  }
  if (data.ok !== true || !('match' in data) || !data.match) {
    const err =
      'error' in data && typeof data.error === 'string'
        ? data.error
        : `Запрос не выполнен (HTTP ${res.status}).`
    const hint = 'hint' in data && typeof data.hint === 'string' ? data.hint : undefined
    return { ok: false, error: err, hint }
  }
  return { ok: true, match: normalizeMatchRow(data.match) }
}
