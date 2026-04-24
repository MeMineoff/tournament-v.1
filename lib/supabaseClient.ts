import { createClient } from '@supabase/supabase-js'
import { getFetchWithRetry } from '@/lib/fetchWithRetry'

/** Вся схема API Tennis Fun Cup — в `tournament` (таблицы groups, players, …). */
export const TOURNAMENT_DB_SCHEMA = 'tournament' as const

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'В корне проекта не найдены NEXT_PUBLIC_SUPABASE_URL и/или NEXT_PUBLIC_SUPABASE_ANON_KEY. Создайте .env.local рядом с package.json (см. панель Supabase → Project Settings → API).'
  )
}

const fetchWithRetry = getFetchWithRetry()

/**
 * `db.schema` задаёт `schema` у PostgREST-клиента (Accept-Profile/Content-Profile на уровне билдера).
 * Дополнительно вешаем те же Profile в `global.headers`, чтобы и GET/POST шли в `tournament`, даже если
 * в части бандлов (RSC/клиент) настройка `db` ведёт себя иначе — иначе PostgREST ищет таблицы в `public`.
 * `global.fetch` — ретраи на обрывах (terminated / ECONNRESET) локально и на слабом канале.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: TOURNAMENT_DB_SCHEMA
  },
  auth: {
    persistSession: false
  },
  global: {
    fetch: fetchWithRetry,
    headers: {
      'apikey': supabaseAnonKey,
      'Accept-Profile': TOURNAMENT_DB_SCHEMA,
      'Content-Profile': TOURNAMENT_DB_SCHEMA
    }
  }
})

export type AppSupabaseClient = typeof supabase