import { TOURNAMENT_DB_SCHEMA } from '@/lib/supabaseClient'

/**
 * Секрет для серверных операций (аналог service_role, обходит RLS):
 * 1) legacy: JWT `service_role` (Settings → API → Legacy: service_role)
 * 2) новый: `sb_secret_...` (Settings → API Keys → Secret)
 *
 * Vercel: задайть одно из имён, без `NEXT_PUBLIC_`.
 */
export function getElevatedSupabaseKey(): string | null {
  const a =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SB_SECRET_KEY?.trim()
  return a && a.length > 0 ? a : null
}

export function hasElevatedSupabaseKey(): boolean {
  return getElevatedSupabaseKey() != null
}

const PROFILE_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Profile': TOURNAMENT_DB_SCHEMA,
  'Content-Profile': TOURNAMENT_DB_SCHEMA,
  Prefer: 'return=representation',
}

/**
 * Прямой POST в PostgREST — стабильнее, чем иногда @supabase/supabase-js
 * в связке с новыми `sb_secret_*` ключами и кастомной схемой `tournament`.
 */
export async function restInsertOneMatch(
  row: Record<string, unknown>
): Promise<{ data: unknown | null; error: { message: string; status?: number; body?: string } | null }> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = getElevatedSupabaseKey()
  if (!base || !key) {
    return { data: null, error: { message: 'Нет ключа: задайте SUPABASE_SERVICE_ROLE_KEY (legacy JWT) или SUPABASE_SECRET_KEY (sb_secret_…).' } }
  }

  const url = `${base}/rest/v1/matches?select=*`
  const body = JSON.stringify(row)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...PROFILE_HEADERS,
    },
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { message?: string; error?: string; hint?: string }
      message = j.message || j.error || j.hint || text || message
    } catch {
      message = text || message
    }
    if (res.status === 401 || res.status === 403) {
      message += ` (проверьте ключ: для новых API Keys в Supabase используйте Secret key, для Legacy — service_role; оба в переменных SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY)`
    }
    return { data: null, error: { message, status: res.status, body: text } }
  }

  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed) && parsed[0] != null) {
      return { data: parsed[0], error: null }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed, error: null }
    }
    return { data: null, error: { message: 'Пустой ответ PostgREST после INSERT.' } }
  } catch {
    return { data: null, error: { message: 'Не удалось разобрать JSON от PostgREST.' } }
  }
}
