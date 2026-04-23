import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'В корне проекта не найдены NEXT_PUBLIC_SUPABASE_URL и/или NEXT_PUBLIC_SUPABASE_ANON_KEY. Создайте .env.local рядом с package.json (см. панель Supabase → Project Settings → API).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'tournament'
  },
  auth: {
    persistSession: false
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey
    }
  }
})