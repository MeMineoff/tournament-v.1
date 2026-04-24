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
type DeleteBody = {
  id?: unknown
  tournament_id?: unknown
}

const CONFIG_HINT =
  'В Vercel (Settings → Environment Variables): SUPABASE_SERVICE_ROLE_KEY = legacy JWT «service_role» (Settings → API → Legacy API Keys) ИЛИ secret sb_secret_… (API Keys). Схема `tournament` в Settings → Data API → Exposed schemas. После смены env — Redeploy. Миграции прав: supabase/migrations/20260425120000_matches_grants.sql и supabase/migrations/20260425191500_service_role_tournament_schema_grants.sql'

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

/**
 * Вставка матча круга. Сначала @supabase/supabase-js (корректно обходит API Gateway
 * для новых `sb_secret_*` и legacy `service_role`), при сбое — PostgREST fetch.
 */
export async function POST(req: Request) {
  try {
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

    const sb = getSupabaseAdminForServer()
    const {
      data: sdkData,
      error: sdkError,
    } = await sb.from('matches').insert(clean).select('*').single()

    if (!sdkError && sdkData) {
      return NextResponse.json({
        ok: true,
        match: normalizeMatchRow(sdkData as Record<string, unknown>),
        via: 'supabase-js',
      })
    }

    let restErrorMessage: string | null = null
    if (hasElevatedSupabaseKey()) {
      const { data: restData, error: restErr } = await restInsertOneMatch(clean)
      if (!restErr && restData != null) {
        return NextResponse.json({
          ok: true,
          match: normalizeMatchRow(restData as Record<string, unknown>),
          via: 'rest',
        })
      }
      if (restErr) {
        restErrorMessage = restErr.message
      }
    }

    if (sdkError) {
      return NextResponse.json(
        {
          ok: false,
          error: sdkError.message,
          restError: restErrorMessage ?? undefined,
          hint: !hasServiceRoleInEnv()
            ? CONFIG_HINT
            : [sdkError.message, restErrorMessage && `PostgREST: ${restErrorMessage}`]
                .filter(Boolean)
                .join(' · '),
          code: sdkError.code,
          details: sdkError.details,
          via: 'supabase-js',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'INSERT не вернул строку',
        restError: restErrorMessage ?? undefined,
        hint: CONFIG_HINT,
      },
      { status: 500 }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Внутренняя ошибка: ${message}` },
      { status: 500 }
    )
  }
}

/** Удаление матча через сервер (устойчивее, чем прямой клиентский запрос к Supabase). */
export async function DELETE(req: Request) {
  try {
    let body: DeleteBody
    try {
      body = (await req.json()) as DeleteBody
    } catch {
      return badRequest('Некорректный JSON.')
    }

    const id = Number(body.id)
    const tournamentId = Number(body.tournament_id)
    if (!Number.isFinite(id) || id <= 0) {
      return badRequest('Передайте id матча (число).')
    }
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return badRequest('Передайте tournament_id (число).')
    }

    const sb = getSupabaseAdminForServer()
    const { data: children, error: childErr } = await sb
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .or(`parent_a_match_id.eq.${id},parent_b_match_id.eq.${id}`)
      .limit(1)

    if (childErr) {
      return NextResponse.json(
        { ok: false, error: childErr.message, hint: !hasServiceRoleInEnv() ? CONFIG_HINT : undefined },
        { status: 500 }
      )
    }
    if (children?.length) {
      return NextResponse.json(
        { ok: false, error: 'Нельзя удалить: на матч ссылается следующий раунд.' },
        { status: 409 }
      )
    }

    const { data: deletedRows, error: delErr } = await sb
      .from('matches')
      .delete()
      .eq('id', id)
      .eq('tournament_id', tournamentId)
      .select('id')

    if (delErr) {
      return NextResponse.json(
        { ok: false, error: delErr.message, hint: !hasServiceRoleInEnv() ? CONFIG_HINT : undefined },
        { status: 500 }
      )
    }
    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Матч не найден или уже удалён.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, deletedId: id, via: 'supabase-js' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Внутренняя ошибка: ${message}` },
      { status: 500 }
    )
  }
}
