import { createClient } from '@supabase/supabase-js'
import { getFetchWithRetry } from '@/lib/fetchWithRetry'
import { getElevatedSupabaseKey } from '@/lib/elevatedSupabaseKey'
import {
  supabase,
  type AppSupabaseClient,
  TOURNAMENT_DB_SCHEMA,
} from '@/lib/supabaseClient'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL

let cached: AppSupabaseClient | null = null
let lastCachedKey: string | null = null

/**
 * Клиент с service role / secret key — только на сервере (Route Handlers, Server Components).
 * Обходит RLS и ограничения anon: нужен для вставок в `tournament.matches` без отдельных GRANT/политик.
 * См. `getElevatedSupabaseKey()` в elevatedSupabaseKey.ts (legacy JWT и новый sb_secret_*).
 * Если ключ не задан, возвращается тот же anon-клиент, что и в браузере.
 */
export function getSupabaseAdminForServer(): AppSupabaseClient {
  const serviceKey = getElevatedSupabaseKey()
  if (!url || !serviceKey) {
    return supabase
  }
  if (cached && lastCachedKey === serviceKey) return cached
  lastCachedKey = serviceKey
  cached = createClient(url, serviceKey, {
    db: { schema: TOURNAMENT_DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: getFetchWithRetry(),
      headers: {
        apikey: serviceKey,
        'Accept-Profile': TOURNAMENT_DB_SCHEMA,
        'Content-Profile': TOURNAMENT_DB_SCHEMA,
      },
    },
  })
  return cached
}

/** Есть ли отдельный service-клиент (для подсказок в API). */
export function hasServiceRoleInEnv(): boolean {
  return Boolean(url && getElevatedSupabaseKey())
}
