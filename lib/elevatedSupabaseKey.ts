import { getFetchWithRetry } from '@/lib/fetchWithRetry'
import { TOURNAMENT_DB_SCHEMA } from '@/lib/supabaseClient'

const fetchWithRetry = getFetchWithRetry()

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

function isLikelyNewSecretKey(k: string): boolean {
  return k.startsWith('sb_secret_')
}

async function postMatchesRest(
  key: string,
  base: string,
  body: string,
  includeAuthorizationBearer: boolean
): Promise<{ res: Response; text: string }> {
  const url = `${base}/rest/v1/matches?select=*`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: key,
    ...PROFILE_HEADERS,
  }
  if (includeAuthorizationBearer) {
    headers.Authorization = `Bearer ${key}`
  }
  const res = await fetchWithRetry(url, { method: 'POST', headers, body })
  const text = await res.text()
  return { res, text }
}

/**
 * Прямой POST в PostgREST (запасной путь; основной путь — `getSupabaseAdminForServer().insert` в Route Handler).
 * На хостed Supabase новые `sb_secret_*` не проходят как JWT в PostgREST «напрямую» в части сценариев — см. @supabase/supabase-js.
 */
export async function restInsertOneMatch(
  row: Record<string, unknown>
): Promise<{ data: unknown | null; error: { message: string; status?: number; body?: string } | null }> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = getElevatedSupabaseKey()
  if (!base || !key) {
    return { data: null, error: { message: 'Нет ключа: задайте SUPABASE_SERVICE_ROLE_KEY (legacy JWT) или SUPABASE_SECRET_KEY (sb_secret_…).' } }
  }

  const body = JSON.stringify(row)
  const attempts: { label: string; includeBearer: boolean }[] = [
    { label: 'apikey+Bearer', includeBearer: true },
  ]
  if (isLikelyNewSecretKey(key)) {
    attempts.push({ label: 'apikey-only (gateway)', includeBearer: false })
  }

  for (const a of attempts) {
    const { res, text } = await postMatchesRest(key, base, body, a.includeBearer)
    if (res.ok) {
      const parsed = parsePostgrestInsertBody(text)
      if (parsed.error) {
        return { data: null, error: { message: parsed.error.message, body: text } }
      }
      return { data: parsed.data, error: null }
    }    // при 401 пробуем следующий вариант заголовков
    if (a.includeBearer && (res.status === 401 || res.status === 403) && isLikelyNewSecretKey(key)) {
      continue
    }
    let message = `HTTP ${res.status} (${a.label})`
    try {
      const j = JSON.parse(text) as { message?: string; error?: string; hint?: string; code?: string }
      message = j.message || j.error || j.hint || text || message
    } catch {
      message = text || message
    }
    if (res.status === 401 || res.status === 403) {
      message += ` (для PostgREST при проблемах с sb_secret_ задайте в Vercel legacy JWT: SUPABASE_SERVICE_ROLE_KEY = service_role с вкладки «Legacy API Keys»)`
    }
    return { data: null, error: { message, status: res.status, body: text } }
  }

  return { data: null, error: { message: 'PostgREST: исчерпаны варианты запроса.' } }
}

function parsePostgrestInsertBody(text: string): {
  data: unknown | null
  error: { message: string } | null
} {
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
