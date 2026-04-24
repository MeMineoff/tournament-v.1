import { createClient } from '@supabase/supabase-js'
import {
  supabase,
  type AppSupabaseClient,
  TOURNAMENT_DB_SCHEMA,
} from '@/lib/supabaseClient'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: AppSupabaseClient | null = null

/**
 * Клиент с service role — только на сервере (Route Handlers, Server Components).
 * Обходит RLS и ограничения anon: нужен для вставок в `tournament.matches` без отдельных GRANT/политик.
 * Если `SUPABASE_SERVICE_ROLE_KEY` не задан, возвращается тот же anon-клиент, что и в браузере.
 */
export function getSupabaseAdminForServer(): AppSupabaseClient {
  if (!url || !serviceKey) {
    return supabase
  }
  if (cached) return cached
  cached = createClient(url, serviceKey, {
    db: { schema: TOURNAMENT_DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
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
  return Boolean(url && serviceKey)
}
