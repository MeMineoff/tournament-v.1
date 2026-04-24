import { NextResponse } from 'next/server'
import { buildPlayoffBracketSkeleton, tierSizesForBracket } from '@/lib/bracket'
import { insertBracketInTiers } from '@/lib/bracketInsert'
import { deleteTournamentCascade } from '@/lib/adminDelete'
import { supabase } from '@/lib/supabaseClient'
import type { Tournament } from '@/lib/types'
import { getTournamentPlayerIdsFromTeams } from '@/lib/tournamentTeams'

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

type CreateTeamBody = {
  action?: 'createTeam'
  tournamentId?: number
  player1Id?: number
  player2Id?: number
  name?: string | null
}

type UpdateTeamBody = {
  action?: 'updateTeam'
  teamId?: number
  name?: string | null
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function POST(req: Request) {
  let body: CreateTournamentBody | CreateTeamBody
  try {
    body = (await req.json()) as CreateTournamentBody | CreateTeamBody
  } catch {
    return badRequest('Некорректный JSON.')
  }

  if ('action' in body && body.action === 'createTeam') {
    const tournamentId = Number(body.tournamentId)
    const player1Id = Number(body.player1Id)
    const player2Id = Number(body.player2Id)
    const name =
      typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim()
        : null
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return badRequest('Некорректный id турнира.')
    }
    if (!Number.isFinite(player1Id) || !Number.isFinite(player2Id) || player1Id <= 0 || player2Id <= 0) {
      return badRequest('Некорректные id игроков команды.')
    }
    if (player1Id === player2Id) {
      return badRequest('Игроки в команде должны быть разными.')
    }
    const { data: sortRows, error: sortErr } = await supabase
      .from('teams')
      .select('sort_index')
      .eq('tournament_id', tournamentId)
      .order('sort_index', { ascending: false })
      .limit(1)
    if (sortErr) {
      return NextResponse.json({ ok: false, error: sortErr.message }, { status: 500 })
    }
    const nextSort = sortRows?.length ? Number(sortRows[0]!.sort_index) + 1 : 0
    const { data, error } = await supabase
      .from('teams')
      .insert({
        tournament_id: tournamentId,
        player_1_id: player1Id,
        player_2_id: player2Id,
        name,
        sort_index: nextSort,
      })
      .select('*')
      .single()
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? 'Не удалось создать команду.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, team: data })
  }

  const tournamentBody = body as CreateTournamentBody

  const groupId = Number(tournamentBody.groupId)
  const name = String(tournamentBody.name ?? '').trim()
  const description = String(tournamentBody.description ?? '').trim()
  const format = tournamentBody.format === 'playoff' ? 'playoff' : 'round_robin'
  const participantType = tournamentBody.participantType === 'double' ? 'double' : 'single'
  const playoffSize =
    format === 'playoff' &&
    (tournamentBody.playoffBracketSize === 4 ||
      tournamentBody.playoffBracketSize === 8 ||
      tournamentBody.playoffBracketSize === 16)
      ? tournamentBody.playoffBracketSize
      : null

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return badRequest('Некорректный groupId.')
  }
  if (!name) {
    return badRequest('Введите название турнира.')
  }
  if (!tournamentBody.scheduledDate) {
    return badRequest('Укажите дату турнира.')
  }

  const payload = {
    group_id: groupId,
    name,
    description: description || null,
    scheduled_date: tournamentBody.scheduledDate,
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
  let body: { id?: number; action?: 'deleteTeam'; teamId?: number }
  try {
    body = (await req.json()) as { id?: number; action?: 'deleteTeam'; teamId?: number }
  } catch {
    return badRequest('Некорректный JSON.')
  }
  if (body.action === 'deleteTeam') {
    const teamId = Number(body.teamId)
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return badRequest('Некорректный id команды.')
    }
    const { error } = await supabase.from('teams').delete().eq('id', teamId)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
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
  let body: UpdateParticipantsBody | UpdateTeamBody
  try {
    body = (await req.json()) as UpdateParticipantsBody | UpdateTeamBody
  } catch {
    return badRequest('Некорректный JSON.')
  }

  if ('action' in body && body.action === 'updateTeam') {
    const teamId = Number(body.teamId)
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return badRequest('Некорректный id команды.')
    }
    const name =
      typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim()
        : null
    const { data, error } = await supabase
      .from('teams')
      .update({ name })
      .eq('id', teamId)
      .select('*')
      .single()
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? 'Не удалось обновить имя команды.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, team: data })
  }

  const participantsBody = body as UpdateParticipantsBody
  const tournamentId = Number(participantsBody.tournamentId)
  const rawIds = Array.isArray(participantsBody.participantIds)
    ? participantsBody.participantIds
    : null
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
