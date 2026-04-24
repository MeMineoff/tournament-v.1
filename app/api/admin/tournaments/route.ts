import { NextResponse } from 'next/server'
import { buildPlayoffBracketSkeleton, tierSizesForBracket } from '@/lib/bracket'
import { insertBracketInTiers } from '@/lib/bracketInsert'
import { deleteTournamentCascade } from '@/lib/adminDelete'
import { supabase } from '@/lib/supabaseClient'
import type { Tournament } from '@/lib/types'

type CreateTournamentBody = {
  groupId: number
  name: string
  description?: string | null
  scheduledDate: string
  format: 'round_robin' | 'playoff'
  participantType: 'single' | 'double'
  playoffBracketSize?: 4 | 8 | 16
}

type UpdateParticipantsBody = {
  tournamentId?: number
  participantIds?: number[]
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function POST(req: Request) {
  let body: CreateTournamentBody
  try {
    body = (await req.json()) as CreateTournamentBody
  } catch {
    return badRequest('Некорректный JSON.')
  }

  const groupId = Number(body.groupId)
  const name = String(body.name ?? '').trim()
  const description = String(body.description ?? '').trim()
  const format = body.format === 'playoff' ? 'playoff' : 'round_robin'
  const participantType = body.participantType === 'double' ? 'double' : 'single'
  const playoffSize =
    format === 'playoff' && (body.playoffBracketSize === 4 || body.playoffBracketSize === 8 || body.playoffBracketSize === 16)
      ? body.playoffBracketSize
      : null

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return badRequest('Некорректный groupId.')
  }
  if (!name) {
    return badRequest('Введите название турнира.')
  }
  if (!body.scheduledDate) {
    return badRequest('Укажите дату турнира.')
  }

  const payload = {
    group_id: groupId,
    name,
    description: description || null,
    scheduled_date: body.scheduledDate,
    format,
    participant_type: participantType,
    status: 'active' as const,
    playoff_bracket_size: playoffSize,
    participant_ids: null,
  }

  const { data: created, error: createErr } = await supabase
    .from('tournaments')
    .insert(payload)
    .select('*')
    .single()
  if (createErr || !created) {
    return NextResponse.json(
      { ok: false, error: createErr?.message ?? 'Не удалось создать турнир.' },
      { status: 500 }
    )
  }

  const tournamentId = Number((created as Tournament).id)

  try {
    if (format === 'playoff' && playoffSize) {
      const { rows, parentLinks } = buildPlayoffBracketSkeleton(
        tournamentId,
        playoffSize,
        participantType
      )
      await insertBracketInTiers(rows, parentLinks, tierSizesForBracket(playoffSize))
    }

    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    return NextResponse.json({
      ok: true,
      tournament: created,
      matchCount: count ?? 0,
    })
  } catch (e: unknown) {
    await deleteTournamentCascade(supabase as any, tournamentId)
    const msg = e instanceof Error ? e.message : 'Ошибка при создании сетки.'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  let body: { id?: number }
  try {
    body = (await req.json()) as { id?: number }
  } catch {
    return badRequest('Некорректный JSON.')
  }
  const id = Number(body.id)
  if (!Number.isFinite(id) || id <= 0) {
    return badRequest('Некорректный id турнира.')
  }
  const err = await deleteTournamentCascade(supabase as any, id)
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  let body: UpdateParticipantsBody
  try {
    body = (await req.json()) as UpdateParticipantsBody
  } catch {
    return badRequest('Некорректный JSON.')
  }

  const tournamentId = Number(body.tournamentId)
  const rawIds = Array.isArray(body.participantIds) ? body.participantIds : null
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    return badRequest('Некорректный id турнира.')
  }
  if (!rawIds) {
    return badRequest('participantIds должен быть массивом.')
  }
  const participantIds = rawIds
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0)
  if (participantIds.length !== rawIds.length) {
    return badRequest('В participantIds должны быть только числовые id > 0.')
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ participant_ids: participantIds })
    .eq('id', tournamentId)
  if (error) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Не удалось обновить состав турнира.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, participantIds })
}
