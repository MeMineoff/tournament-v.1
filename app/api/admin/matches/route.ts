import { NextResponse } from 'next/server'
import { getSupabaseAdminForServer, hasServiceRoleInEnv } from '@/lib/supabaseAdminClient'
import {
  hasElevatedSupabaseKey,
  restInsertOneMatch,
} from '@/lib/elevatedSupabaseKey'
import { normalizeMatchRow } from '@/lib/matchRow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type InsertBody = {
  row?: Record<string, unknown>
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

/**
 * Вставка матча круга. Сначала PostgREST fetch (лучше с новыми `sb_secret_*` и схемой `tournament`),
 * при сбое — @supabase/supabase-js.
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

  const clean = JSON.parse(JSON.stringify(row)) as Record<string, unknown>

  let restErrorMessage: string | null = null
  if (hasElevatedSupabaseKey()) {
    const { data, error: restErr } = await restInsertOneMatch(clean)
    if (!restErr && data != null) {
      return NextResponse.json({
        ok: true,
        match: normalizeMatchRow(data as Record<string, unknown>),
        via: 'rest',
      })
    }
    if (restErr) {
      restErrorMessage = restErr.message
    }
  }

  const sb = getSupabaseAdminForServer()
  const { data, error } = await sb
    .from('matches')
    .insert(clean)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        restError: restErrorMessage ?? undefined,
        hint: !hasServiceRoleInEnv()
          ? 'В Vercel (Settings → Environment Variables) и локально в .env.local: SUPABASE_SERVICE_ROLE_KEY = «service_role» с вкладки Legacy API Keys, ИЛИ SUPABASE_SECRET_KEY = Secret key (sb_secret_…). Схема tournament должна быть в Exposed Schemas (Settings → Data API). Либо миграция: supabase/migrations/20260425120000_matches_grants.sql'
          : restErrorMessage
            ? `PostgREST: ${restErrorMessage} · SDK: ${error.message}`
            : undefined,
        code: error.code,
        details: error.details,
        via: 'supabase-js',
      },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, error: 'INSERT не вернул строку' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    match: normalizeMatchRow(data as Record<string, unknown>),
    via: 'supabase-js',
  })
}
