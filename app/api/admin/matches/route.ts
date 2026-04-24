import { NextResponse } from 'next/server'
import {
  getSupabaseAdminForServer,
  hasServiceRoleInEnv,
} from '@/lib/supabaseAdminClient'
import { normalizeMatchRow } from '@/lib/matchRow'

type InsertBody = {
  row?: Record<string, unknown>
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

/**
 * Вставка матча (круг, админка). Делается с сервера, предпочтительно service_role —
 * иначе тот же anon, что в браузере, и снова возможны RLS/permission.
 */
export async function POST(req: Request) {
  let body: InsertBody
  try {
    body = (await req.json()) as InsertBody
  } catch {
    return badRequest('Некорректный JSON.')
  }

  const row = body.row
  if (!row || typeof row !== 'object') {
    return badRequest('Передайте объект row.')
  }
  const tid = Number((row as { tournament_id?: unknown }).tournament_id)
  if (!Number.isFinite(tid) || tid <= 0) {
    return badRequest('В row должен быть tournament_id (число).')
  }

  const sb = getSupabaseAdminForServer()
  const { data, error } = await sb
    .from('matches')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        hint: !hasServiceRoleInEnv()
          ? 'Добавьте в .env.local SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role) и перезапустите dev-сервер, либо выполните GRANT/политику для tournament.matches (см. supabase/migrations/20260425120000_matches_grants.sql).'
          : undefined,
        code: error.code,
        details: error.details,
      },
      { status: 500 }
    )
  }

  const match = normalizeMatchRow(data as Record<string, unknown>)
  return NextResponse.json({ ok: true, match })
}
