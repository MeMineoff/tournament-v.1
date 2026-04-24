'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  autoTeamName,
  canApplyTeamsToPlayoffR1,
  fetchTournamentTeams,
  getTournamentPlayerIdsFromTeams,
  getPlayoffLeafRoundMatches,
  normalizeTeamRow,
  teamDisplayName,
} from '@/lib/tournamentTeams'
import type { Match, Player, Team, Tournament } from '@/lib/types'
import { validateDoublesMatchRoster } from '@/lib/doublesRoster'
import { normalizeParticipantIds } from '@/lib/participantIds'
import { assertAllParticipantsInTournament } from '@/lib/participantGuards'
import { isDoublesParticipantType } from '@/lib/participantType'
import { propagatePlayoffWinner } from '@/lib/playoffAdvance'
import {
  assertNoPlayoffSameRoundPlayerReuse,
  isPlayoffPlayerDisabledInSelect,
  playoffSameRoundBusyElsewhere,
} from '@/lib/playoffRosterConflict'
import { isPlayoffBracketMatch, isRoundRobinMatch } from '@/lib/stats'

const ROUND_LABEL: Record<string, string> = {
  round_robin: 'Круг',
  round_of_16: '1/16',
  quarterfinal: '1/4',
  semifinal: '1/2',
  final: 'Финал',
}

type Props = {
  tournament: Tournament
  groupPlayers: Player[]
  initialMatches: Match[]
  initialTeams?: Team[]
}

export function TournamentAdminForm({
  tournament: initialTournament,
  groupPlayers,
  initialMatches,
  initialTeams = [],
}: Props) {
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament>(() => ({
    ...initialTournament,
    participant_ids: normalizeParticipantIds(
      initialTournament.participant_ids as unknown
    ),
  }))
  const [matches, setMatches] = useState(initialMatches)
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [msg, setMsg] = useState<string | null>(null)
  /** Ошибки именно формы «Назначение состава» — видны рядом с кнопкой, не только вверху страницы. */
  const [rosterFormErr, setRosterFormErr] = useState<string | null>(null)
  const [savingPid, setSavingPid] = useState(false)

  const [fillMatchId, setFillMatchId] = useState<number | ''>('')
  const [fA, setFA] = useState<number | ''>('')
  const [fA2, setFA2] = useState<number | ''>('')
  const [fB, setFB] = useState<number | ''>('')
  const [fB2, setFB2] = useState<number | ''>('')
  const [fScoreA, setFScoreA] = useState(0)
  const [fScoreB, setFScoreB] = useState(0)
  const [fCompleted, setFCompleted] = useState(false)

  const [addA, setAddA] = useState<number | ''>('')
  const [addA2, setAddA2] = useState<number | ''>('')
  const [addB, setAddB] = useState<number | ''>('')
  const [addB2, setAddB2] = useState<number | ''>('')
  const [addTeamA, setAddTeamA] = useState<number | ''>('')
  const [addTeamB, setAddTeamB] = useState<number | ''>('')
  const [fillTeamA, setFillTeamA] = useState<number | ''>('')
  const [fillTeamB, setFillTeamB] = useState<number | ''>('')
  const [newTeamP1, setNewTeamP1] = useState<number | ''>('')
  const [newTeamP2, setNewTeamP2] = useState<number | ''>('')
  const [newTeamName, setNewTeamName] = useState('')
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [editingTeamName, setEditingTeamName] = useState('')
  const [teamActionBusy, setTeamActionBusy] = useState(false)

  const doubles = isDoublesParticipantType(tournament.participant_type)
  const participantIdsOrdered = useMemo(() => {
    if (doubles && teams.length > 0) {
      return getTournamentPlayerIdsFromTeams(teams)
    }
    return normalizeParticipantIds(tournament.participant_ids) ?? []
  }, [doubles, teams, tournament.participant_ids])

  const playerById = useMemo(() => {
    const m = new Map<number, Player>()
    for (const p of groupPlayers) m.set(Number(p.id), p)
    return m
  }, [groupPlayers])

  /** Эффективный состав турнира: для пар — из команд, иначе — participant_ids. */
  const tournamentRosterPlayers = useMemo(() => {
    const out: Player[] = []
    for (const id of participantIdsOrdered) {
      const pl = playerById.get(Number(id))
      if (pl) out.push(pl)
    }
    return out
  }, [participantIdsOrdered, playerById])

  /** Для селектов: состав + игроки уже в матче (если вдруг не в participant_ids). */
  const rosterPlayers = useMemo(() => {
    const inRoster = new Set(tournamentRosterPlayers.map((p) => Number(p.id)))
    const fillIds = [fA, fA2, fB, fB2].filter(
      (x): x is number => x !== '' && typeof x === 'number'
    )
    const extra: Player[] = []
    for (const id of fillIds) {
      if (inRoster.has(Number(id))) continue
      const pl = playerById.get(Number(id))
      if (pl) extra.push(pl)
    }
    return extra.length ? [...tournamentRosterPlayers, ...extra] : tournamentRosterPlayers
  }, [tournamentRosterPlayers, playerById, fA, fA2, fB, fB2])

  const rosterIdMismatch =
    !doubles &&
    participantIdsOrdered.length > 0 &&
    tournamentRosterPlayers.length < participantIdsOrdered.length
  const participantSet = useMemo(
    () => new Set(participantIdsOrdered.map((x) => Number(x))),
    [participantIdsOrdered]
  )
  const notInTournament = useMemo(
    () => groupPlayers.filter((p) => !participantSet.has(Number(p.id))),
    [groupPlayers, participantSet]
  )

  const teamsOrdered = useMemo(
    () => [...teams].sort((a, b) => a.sort_index - b.sort_index),
    [teams]
  )
  const teamById = useMemo(() => {
    const m = new Map<number, Team>()
    for (const t of teamsOrdered) m.set(Number(t.id), t)
    return m
  }, [teamsOrdered])

  /** Игроки, уже внесённые в существующие пары (для селектов «добавить команду»). */
  const playerIdsInExistingDoublesTeams = useMemo(() => {
    const s = new Set<number>()
    for (const t of teamsOrdered) {
      s.add(Number(t.player_1_id))
      s.add(Number(t.player_2_id))
    }
    return s
  }, [teamsOrdered])

  const playoffR1FromTeamsError = useMemo(() => {
    if (!doubles || tournament.format !== 'playoff') return null
    return canApplyTeamsToPlayoffR1(tournament, teamsOrdered, matches)
  }, [doubles, tournament, teamsOrdered, matches])

  /** Только при смене турнира: не дублируем full sync initial* при каждом RSC-refresh. */
  useEffect(() => {
    setTournament({
      ...initialTournament,
      participant_ids: normalizeParticipantIds(
        initialTournament.participant_ids as unknown
      ),
    } as Tournament)
    setMatches(initialMatches)
    setTeams(initialTeams)
  }, [initialTournament.id])

  useEffect(() => {
    if (!doubles) return
    syncFillTeamsToPlayers(fillTeamA, fillTeamB)
  }, [doubles, fillTeamA, fillTeamB, teamById])

  const playoffBusyElsewhere = useMemo(() => {
    if (tournament.format !== 'playoff' || fillMatchId === '') {
      return new Set<number>()
    }
    const cur = matches.find((m) => m.id === fillMatchId)
    return playoffSameRoundBusyElsewhere(tournament, cur, matches)
  }, [tournament, fillMatchId, matches])

  const bracketMatches = useMemo(
    () => matches.filter(isPlayoffBracketMatch),
    [matches]
  )
  const rrList = useMemo(() => matches.filter(isRoundRobinMatch), [matches])

  function optionTaken(
    optionId: number,
    current: number | '',
    others: Array<number | ''>
  ): boolean {
    if (current !== '' && Number(current) === Number(optionId)) return false
    return others.some((v) => v !== '' && Number(v) === Number(optionId))
  }

  function syncFillFromMatch(m: Match) {
    setFA(m.player_a_id ?? '')
    setFA2(m.player_a2_id ?? '')
    setFB(m.player_b_id ?? '')
    setFB2(m.player_b2_id ?? '')
    if (doubles) {
      setFillTeamA(teamIdForPair(m.player_a_id ?? null, m.player_a2_id ?? null))
      setFillTeamB(teamIdForPair(m.player_b_id ?? null, m.player_b2_id ?? null))
    } else {
      setFillTeamA('')
      setFillTeamB('')
    }
    setFScoreA(Number(m.score_a ?? 0))
    setFScoreB(Number(m.score_b ?? 0))
    setFCompleted(m.status === 'completed')
  }

  async function refreshAll() {
    const [
      { data: tr, error: trErr },
      { data: mr, error: mErr },
      freshTeams,
    ] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournament.id).single(),
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('round_index', { ascending: true })
        .order('bracket_order', { ascending: true }),
      fetchTournamentTeams(supabase, tournament.id),
    ])
    if (trErr) {
      setMsg(`Турнир: ${trErr.message}`)
    } else if (tr) {
      const row = tr as Tournament & { participant_ids?: unknown }
      setTournament({
        ...row,
        participant_ids: normalizeParticipantIds(row.participant_ids),
      } as Tournament)
    }
    if (mErr) {
      setMsg(
        `Список матчей: ${mErr.message} (проверьте GRANT/RLS в Supabase на tournament.matches, см. supabase/migrations/20260425120000_matches_grants.sql).`
      )
    } else if (mr) {
      setMatches(mr as Match[])
    }
    setTeams(freshTeams)
    router.refresh()
  }

  function labelTeamPair(p1: number, p2: number, name?: string | null) {
    const base = teamDisplayName(
      { player_1_id: p1, player_2_id: p2, name: name ?? null },
      groupPlayers
    )
    const a = playerById.get(p1)
    const b = playerById.get(p2)
    if (!a || !b) return base
    return `${base} · ${a.avatar_emoji} ${a.name} + ${b.avatar_emoji} ${b.name}`
  }

  function teamIdForPair(p1: number | null, p2: number | null): number | '' {
    if (p1 == null || p2 == null) return ''
    const found = teamsOrdered.find(
      (t) =>
        (Number(t.player_1_id) === Number(p1) && Number(t.player_2_id) === Number(p2)) ||
        (Number(t.player_1_id) === Number(p2) && Number(t.player_2_id) === Number(p1))
    )
    return found ? Number(found.id) : ''
  }

  function syncFillTeamsToPlayers(teamA: number | '', teamB: number | '') {
    const ta = teamA === '' ? undefined : teamById.get(Number(teamA))
    const tb = teamB === '' ? undefined : teamById.get(Number(teamB))
    if (!ta || !tb) {
      setFA('')
      setFA2('')
      setFB('')
      setFB2('')
      return
    }
    setFA(Number(ta.player_1_id))
    setFA2(Number(ta.player_2_id))
    setFB(Number(tb.player_1_id))
    setFB2(Number(tb.player_2_id))
  }

  async function addTournamentTeam(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (newTeamP1 === '' || newTeamP2 === '') {
      setMsg('Выберите обоих игрока пары.')
      return
    }
    if (newTeamP1 === newTeamP2) {
      setMsg('В паре должны быть два разных игрока.')
      return
    }
    if (
      teamsOrdered.some(
        (t) =>
          Number(t.player_1_id) === Number(newTeamP1) ||
          Number(t.player_2_id) === Number(newTeamP1) ||
          Number(t.player_1_id) === Number(newTeamP2) ||
          Number(t.player_2_id) === Number(newTeamP2)
      )
    ) {
      setMsg('Один из игроков уже состоит в другой команде этого турнира.')
      return
    }
    setTeamActionBusy(true)
    const generatedName = autoTeamName(
      { player_1_id: Number(newTeamP1), player_2_id: Number(newTeamP2) },
      groupPlayers
    )
    const res = await fetch('/api/admin/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createTeam',
        tournamentId: tournament.id,
        player1Id: Number(newTeamP1),
        player2Id: Number(newTeamP2),
        name: newTeamName.trim() || generatedName,
      }),
    })
    const payload = (await res.json().catch(() => null)) as
      | { ok: true; team: Team }
      | { ok: false; error?: string }
      | null
    setTeamActionBusy(false)
    if (!res.ok || !payload || payload.ok !== true) {
      setMsg(
        payload && 'error' in payload && payload.error
          ? payload.error
          : `Не удалось создать команду (HTTP ${res.status}).`
      )
      return
    }
    const created = normalizeTeamRow(payload.team as Record<string, unknown>)
    setTeams((prev) => {
      if (prev.some((t) => t.id === created.id)) return prev
      return [...prev, created].sort((a, b) => a.sort_index - b.sort_index)
    })
    setNewTeamP1('')
    setNewTeamP2('')
    setNewTeamName('')
    setMsg('Команда добавлена ✅')
    await refreshAll()
  }

  async function removeTournamentTeam(id: number) {
    if (!confirm('Удалить эту пару из списка команд турнира?')) return
    setMsg(null)
    setTeamActionBusy(true)
    const res = await fetch('/api/admin/tournaments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteTeam', teamId: id }),
    })
    const payload = (await res.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; error?: string }
      | null
    setTeamActionBusy(false)
    if (!res.ok || !payload || payload.ok !== true) {
      setMsg(
        payload && 'error' in payload && payload.error
          ? payload.error
          : `Не удалось удалить команду (HTTP ${res.status}).`
      )
      return
    }
    setMsg('Команда удалена.')
    await refreshAll()
  }

  async function saveTeamName(teamId: number) {
    setMsg(null)
    setTeamActionBusy(true)
    const newName = editingTeamName.trim() || null
    const res = await fetch('/api/admin/tournaments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateTeam',
        teamId,
        name: newName,
      }),
    })
    const payload = (await res.json().catch(() => null)) as
      | { ok: true; team: Team }
      | { ok: false; error?: string }
      | null
    setTeamActionBusy(false)
    if (!res.ok || !payload || payload.ok !== true) {
      setMsg(
        payload && 'error' in payload && payload.error
          ? payload.error
          : `Не удалось обновить имя команды (HTTP ${res.status}).`
      )
      return
    }
    const updated = normalizeTeamRow(payload.team as Record<string, unknown>)
    setTeams((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    )
    setEditingTeamId(null)
    setEditingTeamName('')
    setMsg('Название команды обновлено ✅')
    await refreshAll()
  }

  async function applyPlayoffR1FromTeams() {
    setMsg(null)
    const err = canApplyTeamsToPlayoffR1(tournament, teamsOrdered, matches)
    if (err) {
      setMsg(err)
      return
    }
    const leaf = getPlayoffLeafRoundMatches(matches)
    const sorted = teamsOrdered
    const allPids: number[] = []
    for (let i = 0; i < leaf.length; i++) {
      const tA = sorted[2 * i]!
      const tB = sorted[2 * i + 1]!
      allPids.push(
        tA.player_1_id,
        tA.player_2_id,
        tB.player_1_id,
        tB.player_2_id
      )
    }
    if (new Set(allPids).size !== allPids.length) {
      setMsg(
        'Среди выбранных пар есть общий игрок. В одном туре плей-офф участник не может играть дважды.'
      )
      return
    }
    const pRoster = participantIdsOrdered
    for (let i = 0; i < leaf.length; i++) {
      const tA = sorted[2 * i]!
      const tB = sorted[2 * i + 1]!
      const m = leaf[i]!
      const v = validateDoublesMatchRoster(
        tA.player_1_id,
        tA.player_2_id,
        tB.player_1_id,
        tB.player_2_id
      )
      if (v) {
        setMsg(v)
        return
      }
      const w = assertAllParticipantsInTournament(
        [
          tA.player_1_id,
          tA.player_2_id,
          tB.player_1_id,
          tB.player_2_id,
        ],
        pRoster
      )
      if (w) {
        setMsg(w)
        return
      }
    }
    if (leaf.some((m) => m.status === 'completed')) {
      if (
        !confirm(
          'В матчах первого раунда уже есть завершённые игры. Перезаписать состав (сброс сетки в этих ячейках: счёт 0:0, статус «запланировано»)?'
        )
      ) {
        return
      }
    }
    setTeamActionBusy(true)
    for (let i = 0; i < leaf.length; i++) {
      const tA = sorted[2 * i]!
      const tB = sorted[2 * i + 1]!
      const m = leaf[i]!
      const { error } = await supabase
        .from('matches')
        .update({
          player_a_id: tA.player_1_id,
          player_a2_id: tA.player_2_id,
          player_b_id: tB.player_1_id,
          player_b2_id: tB.player_2_id,
          score_a: 0,
          score_b: 0,
          status: 'scheduled',
        })
        .eq('id', m.id)
      if (error) {
        setTeamActionBusy(false)
        setMsg(error.message)
        return
      }
    }
    setTeamActionBusy(false)
    setMsg('Первый раунд сетки заполнен по списку пар ✅')
    await refreshAll()
  }

  async function updateParticipantIds(next: number[]) {
    if (doubles) {
      setMsg('В парном турнире состав считается по командам и не редактируется отдельно.')
      return
    }
    setSavingPid(true)
    setMsg(null)
    // Сразу отражаем локально, чтобы кнопка выглядела «живой», даже если сеть медленная.
    setTournament((prev) => ({ ...prev, participant_ids: next }))
    try {
      const res = await fetch('/api/admin/tournaments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          participantIds: next,
        }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { ok: true; participantIds?: number[] }
        | { ok: false; error?: string }
        | null
      if (!res.ok || !payload || payload.ok !== true) {
        setTournament((prev) => ({
          ...prev,
          participant_ids: normalizeParticipantIds(tournament.participant_ids),
        }))
        setSavingPid(false)
        setMsg(
          payload && 'error' in payload && payload.error
            ? payload.error
            : `Не удалось обновить состав турнира (HTTP ${res.status}).`
        )
        return
      }
    } catch (e: unknown) {
      setTournament((prev) => ({
        ...prev,
        participant_ids: normalizeParticipantIds(tournament.participant_ids),
      }))
      setSavingPid(false)
      setMsg(e instanceof Error ? e.message : 'Не удалось обновить состав турнира.')
      return
    }
    setSavingPid(false)
    await refreshAll()
    setMsg('Состав турнира обновлён ✅')
  }

  async function addParticipant(playerId: number) {
    if (doubles) return
    const cur = normalizeParticipantIds(tournament.participant_ids) ?? []
    if (cur.some((id) => Number(id) === Number(playerId))) return
    const next = [...cur, Number(playerId)]
    await updateParticipantIds(next)
  }

  async function removeParticipant(playerId: number) {
    if (doubles) return
    const cur = normalizeParticipantIds(tournament.participant_ids) ?? []
    const next = cur.filter((id) => Number(id) !== Number(playerId))
    await updateParticipantIds(next)
  }

  async function saveMatchRoster(e: React.FormEvent) {
    e.preventDefault()
    setRosterFormErr(null)
    if (fillMatchId === '') {
      setRosterFormErr('Выберите матч.')
      return
    }
    const pids = participantIdsOrdered
    const curMatch = matches.find((m) => m.id === fillMatchId)
    if (!curMatch) {
      setRosterFormErr('Матч не найден в списке — обновите страницу.')
      return
    }
    if (doubles) {
      if (fillTeamA === '' || fillTeamB === '') {
        setRosterFormErr('Выберите две команды.')
        return
      }
      if (fillTeamA === fillTeamB) {
        setRosterFormErr('Команда A и B должны быть разными.')
        return
      }
      const ta = teamById.get(Number(fillTeamA))
      const tb = teamById.get(Number(fillTeamB))
      if (!ta || !tb) {
        setRosterFormErr('Одна из выбранных команд не найдена. Обновите страницу.')
        return
      }
      const a1 = Number(ta.player_1_id)
      const a2 = Number(ta.player_2_id)
      const b1 = Number(tb.player_1_id)
      const b2 = Number(tb.player_2_id)
      const v = validateDoublesMatchRoster(a1, a2, b1, b2)
      if (v) {
        setRosterFormErr(v)
        return
      }
      const err = assertAllParticipantsInTournament(
        [a1, a2, b1, b2],
        pids
      )
      if (err) {
        setRosterFormErr(err)
        return
      }
      const clash = assertNoPlayoffSameRoundPlayerReuse(
        tournament,
        curMatch,
        [a1, a2, b1, b2],
        matches
      )
      if (clash) {
        setRosterFormErr(clash)
        return
      }
      const { error } = await supabase
        .from('matches')
        .update({
          player_a_id: a1,
          player_a2_id: a2,
          player_b_id: b1,
          player_b2_id: b2,
          score_a: Number(fScoreA),
          score_b: Number(fScoreB),
          status: fCompleted ? 'completed' : 'scheduled',
        })
        .eq('id', fillMatchId)
      if (error) {
        setRosterFormErr(error.message)
        return
      }
    } else {
      if (fA === '' || fB === '') {
        setRosterFormErr('Укажите игрока A и B.')
        return
      }
      if (fA === fB) {
        setRosterFormErr('Игроки должны быть разными.')
        return
      }
      const err = assertAllParticipantsInTournament([Number(fA), Number(fB)], pids)
      if (err) {
        setRosterFormErr(err)
        return
      }
      const clash = assertNoPlayoffSameRoundPlayerReuse(
        tournament,
        curMatch,
        [Number(fA), Number(fB)],
        matches
      )
      if (clash) {
        setRosterFormErr(clash)
        return
      }
      const { error } = await supabase
        .from('matches')
        .update({
          player_a_id: Number(fA),
          player_a2_id: null,
          player_b_id: Number(fB),
          player_b2_id: null,
          score_a: Number(fScoreA),
          score_b: Number(fScoreB),
          status: fCompleted ? 'completed' : 'scheduled',
        })
        .eq('id', fillMatchId)
      if (error) {
        setRosterFormErr(error.message)
        return
      }
    }
    const savedMatchId = fillMatchId
    setFillMatchId('')
    setFA('')
    setFA2('')
    setFB('')
    setFB2('')
    setFillTeamA('')
    setFillTeamB('')
    setFScoreA(0)
    setFScoreB(0)
    setFCompleted(false)
    setRosterFormErr(null)
    setMsg('Матч обновлён ✅')
    if (tournament.format === 'playoff' && fCompleted) {
      await propagatePlayoffWinner(Number(savedMatchId))
    }
    await refreshAll()
  }

  async function addRoundRobinMatch(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    console.log('Добавляем матч...', {
      tournamentId: tournament.id,
      format: tournament.format,
      doubles,
      addA,
      addB,
      addTeamA,
      addTeamB,
    })
    if (tournament.format !== 'round_robin') {
      setMsg('Добавить матч круга можно только у турнира в формате «круг». Для плей-офф используйте сетку и кнопки заполнения выше.')
      return
    }
    const pids = participantIdsOrdered
    let doublesRowTeams:
      | { a1: number; a2: number; b1: number; b2: number }
      | null = null
    if (doubles) {
      if (addTeamA === '' || addTeamB === '') {
        setMsg('Выберите две команды.')
        return
      }
      if (addTeamA === addTeamB) {
        setMsg('Команда A и B должны быть разными.')
        return
      }
      const ta = teamById.get(Number(addTeamA))
      const tb = teamById.get(Number(addTeamB))
      if (!ta || !tb) {
        setMsg('Одна из выбранных команд не найдена. Обновите страницу.')
        return
      }
      const a1 = Number(ta.player_1_id)
      const a2 = Number(ta.player_2_id)
      const b1 = Number(tb.player_1_id)
      const b2 = Number(tb.player_2_id)
      const v = validateDoublesMatchRoster(
        a1,
        a2,
        b1,
        b2
      )
      if (v) {
        setMsg(v)
        return
      }
      const err = assertAllParticipantsInTournament(
        [a1, a2, b1, b2],
        pids
      )
      if (err) {
        setMsg(err)
        return
      }
      doublesRowTeams = { a1, a2, b1, b2 }
    } else {
      if (addA === '' || addB === '') {
        setMsg('Укажите двух игроков.')
        return
      }
      if (addA === addB) {
        setMsg('Игроки должны быть разными.')
        return
      }
      const err = assertAllParticipantsInTournament([Number(addA), Number(addB)], pids)
      if (err) {
        setMsg(err)
        return
      }
    }

    // Не блокируем добавление матча сетевой ошибкой чтения Supabase с клиента
    // (например ERR_CONNECTION_RESET): порядок можно безопасно оценить по локальному state.
    const maxBo = Math.max(
      0,
      ...matches.map((m) => Number((m as { bracket_order?: number }).bracket_order ?? 0))
    )

    const row = doubles
      ? {
          tournament_id: tournament.id,
          player_a_id: Number(doublesRowTeams!.a1),
          player_a2_id: Number(doublesRowTeams!.a2),
          player_b_id: Number(doublesRowTeams!.b1),
          player_b2_id: Number(doublesRowTeams!.b2),
          score_a: 0,
          score_b: 0,
          status: 'scheduled',
          round: 'round_robin',
          round_index: 0,
          bracket_order: maxBo + 1,
          parent_a_match_id: null,
          parent_b_match_id: null,
        }
      : {
          tournament_id: tournament.id,
          player_a_id: Number(addA),
          player_a2_id: null,
          player_b_id: Number(addB),
          player_b2_id: null,
          score_a: 0,
          score_b: 0,
          status: 'scheduled',
          round: 'round_robin',
          round_index: 0,
          bracket_order: maxBo + 1,
          parent_a_match_id: null,
          parent_b_match_id: null,
        }

    const resIns = await fetch(
      new URL('/api/admin/matches', window.location.origin).toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row }),
        credentials: 'same-origin',
      }
    )
    const insPayload = (await resIns.json().catch(() => null)) as
      | { ok: true; match: Match; via?: string }
      | { ok: false; error?: string; hint?: string; restError?: string; details?: string }
      | null
    if (!resIns.ok || !insPayload || insPayload.ok !== true) {
      const p = insPayload && typeof insPayload === 'object' ? insPayload : null
      const err =
        p && 'error' in p && p.error
          ? p.error
          : `HTTP ${resIns.status}`
      const restE = p && 'restError' in p && p.restError ? p.restError : ''
      const hint = p && 'hint' in p && p.hint ? p.hint : ''
      const parts = [err, restE && `PostgREST: ${restE}`, hint].filter(Boolean)
      setMsg(parts.join('\n\n'))
      return
    }
    const inserted = insPayload.match
    setMatches((prev) => {
      const list = [...prev, inserted]
      return list.sort(
        (a, b) => a.round_index - b.round_index || a.bracket_order - b.bracket_order
      )
    })
    setAddA('')
    setAddA2('')
    setAddB('')
    setAddB2('')
    setAddTeamA('')
    setAddTeamB('')
    setMsg('Матч добавлен ✅')
    await refreshAll()
  }

  async function deleteMatch(id: number) {
    if (!confirm('Удалить этот матч?')) return
    setMsg(null)
    const { data: children, error: chErr } = await supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournament.id)
      .or(`parent_a_match_id.eq.${id},parent_b_match_id.eq.${id}`)
      .limit(1)
    if (chErr) {
      setMsg(chErr.message)
      return
    }
    if (children?.length) {
      setMsg('Нельзя удалить: на матч ссылается следующий раунд.')
      return
    }
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) {
      setMsg(error.message)
      return
    }
    await refreshAll()
    setMsg('Матч удалён.')
  }

  const openFill = (m: Match) => {
    setRosterFormErr(null)
    setFillMatchId(m.id)
    syncFillFromMatch(m)
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)]">
          Редактирование турнира
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          <Link
            href={`/tournament/${tournament.id}`}
            className="font-bold underline decoration-2 underline-offset-2 hover:text-[var(--clay)]"
          >
            Открыть публичную страницу →
          </Link>
        </p>
      </header>

      {msg && (
        <p className="whitespace-pre-wrap rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-3 text-sm font-bold text-[var(--ink)]">
          {msg}
        </p>
      )}

      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Основная информация
        </h2>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="font-bold text-[var(--ink-muted)]">Название</dt>
            <dd className="font-semibold">{tournament.name}</dd>
          </div>
          {tournament.description && (
            <div>
              <dt className="font-bold text-[var(--ink-muted)]">Описание</dt>
              <dd>{tournament.description}</dd>
            </div>
          )}
          <div>
            <dt className="font-bold text-[var(--ink-muted)]">Дата</dt>
            <dd>{tournament.scheduled_date?.slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="font-bold text-[var(--ink-muted)]">Формат</dt>
            <dd>{tournament.format}</dd>
          </div>
          <div>
            <dt className="font-bold text-[var(--ink-muted)]">Тип</dt>
            <dd>{doubles ? 'Пары' : 'Одиночки'}</dd>
          </div>
          {tournament.format === 'playoff' && (
            <div>
              <dt className="font-bold text-[var(--ink-muted)]">Размер сетки</dt>
              <dd>{tournament.playoff_bracket_size}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-[var(--ink-muted)]">
          Название, дату и статус можно править во вкладке «Турниры» общей админки (кнопка
          «Изменить» в списке).
        </p>
      </section>

      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          {doubles ? 'Состав турнира' : 'Участники турнира'}
        </h2>
        <p className="mb-4 rounded-lg border border-[var(--ink)]/20 bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
          {doubles
            ? 'В парном турнире состав вычисляется автоматически по списку команд ниже. Отдельно игроков в состав здесь не добавляем.'
            : 'Пул участников ведётся здесь. В матчах можно выбирать только людей из списка «В составе турнира».'}
        </p>
        {rosterIdMismatch && (
          <p className="mb-4 rounded-lg border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-xs font-bold text-[var(--ink)]">
            В базе в составе турнира указано id больше, чем удалось сопоставить с игроками
            кластера ({tournamentRosterPlayers.length} из {participantIdsOrdered.length}).
            Проверьте, что турнир привязан к нужному кластеру и игроки не удалялись.
          </p>
        )}
        {!doubles && savingPid && (
          <p className="mb-2 text-sm font-semibold text-[var(--ink-muted)]">Сохранение состава…</p>
        )}
        <div className="mb-6">
          <p className="mb-2 text-sm font-bold">
            В составе турнира ({tournamentRosterPlayers.length})
            {!doubles && participantIdsOrdered.length > 0 && (
              <span className="ml-2 font-mono text-xs font-normal text-[var(--ink-muted)]">
                · в БД: {participantIdsOrdered.length} id
              </span>
            )}
          </p>
          {tournamentRosterPlayers.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              Состав пуст. Если вы уже выбирали людей при создании, в таблице турнира, скорее
              всего, не сохранилось поле <code className="rounded bg-[var(--cream)] px-1">participant_ids</code> — проверьте строку в Supabase или создайте турнир заново.
            </p>
          ) : (
            <ul className="space-y-2">
              {tournamentRosterPlayers.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <span>
                    {p.avatar_emoji} <strong>{p.name}</strong>
                  </span>
                  {!doubles && (
                    <button
                      type="button"
                      onClick={() => void removeParticipant(Number(p.id))}
                      disabled={savingPid}
                      className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Убрать
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!doubles && (
          <div>
            <p className="mb-2 text-sm font-bold">Игроки кластера вне турнира ({notInTournament.length})</p>
            {notInTournament.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">Все игроки кластера уже добавлены.</p>
            ) : (
              <ul className="space-y-2">
                {notInTournament.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/40 px-3 py-2"
                  >
                    <span>
                      {p.avatar_emoji} {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void addParticipant(Number(p.id))}
                      disabled={savingPid}
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Добавить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {doubles && (
        <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-bold">
            Пары (команды) турнира
          </h2>
          <p className="mb-4 text-xs text-[var(--ink-muted)]">
            Список хранится в базе, привязан к этому турниру. Порядок важен: сначала идут пары
            с меньшим <span className="font-mono">sort_index</span> (как в таблице ниже). Для
            круга и турнирной таблицы по командам используются именно эти пары. Если список
            пуст, пары в таблице строятся по составу: два id подряд в «участниках».
          </p>
          {teamsOrdered.length === 0 ? (
            <p className="mb-3 text-sm text-[var(--ink-muted)]">Команд пока нет — добавьте первую снизу.</p>
          ) : (
            <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
              {teamsOrdered.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
                >
                  {editingTeamId === t.id ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        className="min-w-[220px] flex-1 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 text-sm"
                        placeholder={autoTeamName(t, groupPlayers)}
                      />
                      <button
                        type="button"
                        onClick={() => void saveTeamName(t.id)}
                        disabled={teamActionBusy}
                        className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1 text-xs font-black disabled:opacity-60"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeamId(null)
                          setEditingTeamName('')
                        }}
                        className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1 text-xs font-black"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">
                        {labelTeamPair(t.player_1_id, t.player_2_id, t.name)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTeamId(t.id)
                            setEditingTeamName(t.name ?? '')
                          }}
                          className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1 text-xs font-black"
                        >
                          Имя
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTournamentTeam(t.id)}
                          disabled={teamActionBusy}
                          className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Удалить
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}

          <form
            onSubmit={(e) => void addTournamentTeam(e)}
            className="mb-4 grid gap-3 border-t border-[var(--ink)]/20 pt-4 sm:grid-cols-2"
          >
            <p className="text-sm font-bold sm:col-span-full">Добавить команду</p>
            <label className="text-sm font-bold">
              Игрок 1
              <select
                value={newTeamP1 === '' ? '' : String(newTeamP1)}
                onChange={(e) =>
                  setNewTeamP1(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={teamActionBusy}
                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
              >
                <option value="">—</option>
                {groupPlayers.map((p) => {
                  const id = Number(p.id)
                  const inOtherPair = playerIdsInExistingDoublesTeams.has(id)
                  return (
                    <option
                      key={p.id}
                      value={String(p.id)}
                      disabled={
                        inOtherPair ||
                        optionTaken(id, newTeamP1, [newTeamP2])
                      }
                    >
                      {p.avatar_emoji} {p.name}
                      {inOtherPair ? ' (уже в паре)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="text-sm font-bold">
              Игрок 2
              <select
                value={newTeamP2 === '' ? '' : String(newTeamP2)}
                onChange={(e) =>
                  setNewTeamP2(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={teamActionBusy}
                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
              >
                <option value="">—</option>
                {groupPlayers.map((p) => {
                  const id = Number(p.id)
                  const inOtherPair = playerIdsInExistingDoublesTeams.has(id)
                  return (
                    <option
                      key={p.id}
                      value={String(p.id)}
                      disabled={
                        inOtherPair ||
                        optionTaken(id, newTeamP2, [newTeamP1])
                      }
                    >
                      {p.avatar_emoji} {p.name}
                      {inOtherPair ? ' (уже в паре)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="text-sm font-bold sm:col-span-full">
              Название команды
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder={
                  newTeamP1 !== '' && newTeamP2 !== ''
                    ? autoTeamName(
                        {
                          player_1_id: Number(newTeamP1),
                          player_2_id: Number(newTeamP2),
                        },
                        groupPlayers
                      )
                    : 'Например: Smash Bros'
                }
                disabled={teamActionBusy}
                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
              />
            </label>
            <div className="sm:col-span-full">
              <button
                type="submit"
                disabled={teamActionBusy || groupPlayers.length < 2}
                className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-6 py-2.5 text-sm font-black shadow-[3px_3px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Добавить команду
              </button>
            </div>
          </form>

          {tournament.format === 'playoff' && (
            <div className="border-t border-[var(--ink)]/20 pt-4">
              <p className="mb-2 text-sm font-bold">Плей-офф: первый раунд сетки</p>
              <p className="mb-3 text-xs text-[var(--ink-muted)]">
                Матч 1: пара #1 vs #2, матч 2: #3 vs #4, и так далее. Нужен полный набор:{' '}
                <span className="font-mono">
                  {tournament.playoff_bracket_size ?? '—'}
                </span>{' '}
                команд, столько же матчей в нижней линии сетки.
              </p>
              {playoffR1FromTeamsError && (
                <p className="mb-2 rounded-lg border-2 border-[var(--clay)]/50 bg-[var(--cream)] px-3 py-2 text-xs text-[var(--ink)]">
                  {playoffR1FromTeamsError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void applyPlayoffR1FromTeams()}
                disabled={teamActionBusy || Boolean(playoffR1FromTeamsError)}
                className="rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] px-4 py-2 text-sm font-bold text-[var(--cream)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Заполнить 1-й раунд сетки по списку пар
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Матчи турнира
        </h2>

        {tournament.format === 'playoff' && (
          <p className="mb-4 text-sm text-[var(--ink-muted)]">
            <strong>Плей-офф</strong> — сетка и заполнение ячеек в таблице ниже. Запрос{' '}
            <code className="rounded bg-[var(--cream)] px-1 font-mono">POST /api/admin/matches</code>{' '}
            (добавить матч круга) на этой странице не вызывается; он бывает только в
            круговом турнире, в блоке «Добавить матч (круг)».
          </p>
        )}

        {tournament.format === 'round_robin' && (
          <div className="mb-8 space-y-4">
            <h3 className="text-lg font-black">Добавить матч (круг)</h3>
            <form
              onSubmit={(e) => {
                console.log('Submit формы "Добавить матч (круг)"')
                void addRoundRobinMatch(e)
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              {doubles ? (
                <>
                  <label className="text-sm font-bold">
                    Команда A
                    <select
                      value={addTeamA === '' ? '' : String(addTeamA)}
                      onChange={(e) =>
                        setAddTeamA(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {teamsOrdered.map((t) => (
                        <option
                          key={t.id}
                          value={String(t.id)}
                          disabled={optionTaken(Number(t.id), addTeamA, [addTeamB])}
                        >
                          {labelTeamPair(t.player_1_id, t.player_2_id, t.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold">
                    Команда B
                    <select
                      value={addTeamB === '' ? '' : String(addTeamB)}
                      onChange={(e) =>
                        setAddTeamB(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {teamsOrdered.map((t) => (
                        <option
                          key={t.id}
                          value={String(t.id)}
                          disabled={optionTaken(Number(t.id), addTeamB, [addTeamA])}
                        >
                          {labelTeamPair(t.player_1_id, t.player_2_id, t.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm font-bold">
                    Игрок A
                    <select
                      value={addA}
                      onChange={(e) => setAddA(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {rosterPlayers.map((p) => (
                        <option
                          key={p.id}
                          value={String(p.id)}
                          disabled={optionTaken(Number(p.id), addA, [addB])}
                        >
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold">
                    Игрок B
                    <select
                      value={addB}
                      onChange={(e) => setAddB(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {rosterPlayers.map((p) => (
                        <option
                          key={p.id}
                          value={String(p.id)}
                          disabled={optionTaken(Number(p.id), addB, [addA])}
                        >
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {doubles && teamsOrdered.length < 2 && (
                <p className="sm:col-span-full text-xs text-[var(--ink-muted)]">
                  Сначала добавьте минимум 2 команды в блоке «Пары (команды) турнира».
                </p>
              )}
              <div className="sm:col-span-full">
                <button
                  type="submit"
                  onClick={() => {
                    console.log('Клик по кнопке "Добавить матч"')
                  }}
                  disabled={doubles && teamsOrdered.length < 2}
                  className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-6 py-2.5 text-sm font-black shadow-[3px_3px_0_var(--ink)]"
                >
                  Добавить матч
                </button>
              </div>
            </form>

            <h3 className="text-lg font-black">Матчи круга</h3>
            {rrList.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">Матчей ещё нет.</p>
            ) : (
              <ul className="space-y-2">
                {rrList.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">#{m.id}</span>
                    <span>
                      {doubles
                        ? `${labelTeamPair(
                            Number(m.player_a_id ?? 0),
                            Number(m.player_a2_id ?? 0),
                            teamById.get(Number(teamIdForPair(m.player_a_id, m.player_a2_id)))?.name
                          )} vs ${labelTeamPair(
                            Number(m.player_b_id ?? 0),
                            Number(m.player_b2_id ?? 0),
                            teamById.get(Number(teamIdForPair(m.player_b_id, m.player_b2_id)))?.name
                          )}`
                        : `${m.player_a_id ?? '—'} vs ${m.player_b_id ?? '—'}`}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openFill(m)}
                        className="rounded-lg border-2 border-[var(--ink)] px-2 py-1 text-xs font-bold"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMatch(m.id)}
                        className="rounded-lg border border-[var(--clay)] bg-[var(--clay-soft)] px-2 py-1 text-xs font-bold"
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tournament.format === 'playoff' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ink-muted)]">
              Пустые ячейки сетки можно заполнить или переназначить. Для парного плей-офф
              используются команды из блока выше; для одиночек — игроки из состава турнира.
            </p>
            <div className="overflow-x-auto rounded-xl border-2 border-[var(--ink)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className="px-3 py-2 font-black">Раунд</th>
                    <th className="px-3 py-2 font-black">id</th>
                    <th className="px-3 py-2 font-black">Статус</th>
                    <th className="px-3 py-2 font-black" />
                  </tr>
                </thead>
                <tbody>
                  {bracketMatches.map((m) => {
                    const empty =
                      m.player_a_id == null &&
                      m.player_b_id == null &&
                      (!doubles ||
                        (m.player_a2_id == null && m.player_b2_id == null))
                    return (
                      <tr key={m.id} className="border-t border-[var(--ink)]">
                        <td className="px-3 py-2">
                          {ROUND_LABEL[m.round ?? ''] ?? m.round ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
                        <td className="px-3 py-2">
                          {empty ? (
                            <span className="font-bold text-[var(--clay)]">не назначено</span>
                          ) : (
                            <span>состав есть</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openFill(m)}
                            className="rounded-lg border-2 border-[var(--ink)] bg-[var(--lime)] px-2 py-1 text-xs font-black"
                          >
                            {empty ? 'Заполнить' : 'Изменить'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {fillMatchId !== '' && (
          <form
            autoComplete="off"
            onSubmit={(e) => void saveMatchRoster(e)}
            className="relative z-30 mt-6 space-y-3 rounded-xl border-2 border-[var(--clay)] bg-[var(--cream)]/40 p-4 shadow-[4px_4px_0_var(--ink)]"
          >
            <p className="font-black">Назначение состава · матч #{fillMatchId}</p>
            {tournament.format === 'playoff' && playoffBusyElsewhere.size > 0 && (
              <p className="rounded-lg border-2 border-[var(--ink)]/30 bg-[var(--court)]/20 px-3 py-2 text-xs font-semibold text-[var(--ink)]">
                🎾 В соседних матчах <strong>этого же тура</strong> заняты другие заявленные
                игроки — в списках они <strong>неактивны</strong> (нельзя выбрать дважды).
              </p>
            )}
            {rosterFormErr && (
              <p
                className="rounded-lg border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-sm font-bold text-[var(--ink)]"
                role="alert"
              >
                {rosterFormErr}
              </p>
            )}
            {rosterPlayers.length === 0 ? (
              <p className="rounded-lg border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-sm font-bold text-[var(--ink)]">
                В составе турнира пока никого нет — сначала добавьте участников в блоке выше.
                Пока список пуст, в выпадающих списках не будет имён.
              </p>
            ) : (
              <p className="text-xs text-[var(--ink-muted)]">
                Доступно игроков в селектах: {rosterPlayers.length}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {doubles ? (
                <>
                  <label className="text-xs font-bold">
                    Команда A
                    <select
                      value={fillTeamA === '' ? '' : String(fillTeamA)}
                      onChange={(e) =>
                        setFillTeamA(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {teamsOrdered.map((t) => {
                        const busy =
                          playoffBusyElsewhere.has(Number(t.player_1_id)) ||
                          playoffBusyElsewhere.has(Number(t.player_2_id))
                        return (
                          <option
                            key={t.id}
                            value={String(t.id)}
                            disabled={
                              optionTaken(Number(t.id), fillTeamA, [fillTeamB]) || busy
                            }
                          >
                            {labelTeamPair(t.player_1_id, t.player_2_id, t.name)}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <label className="text-xs font-bold">
                    Команда B
                    <select
                      value={fillTeamB === '' ? '' : String(fillTeamB)}
                      onChange={(e) =>
                        setFillTeamB(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {teamsOrdered.map((t) => {
                        const busy =
                          playoffBusyElsewhere.has(Number(t.player_1_id)) ||
                          playoffBusyElsewhere.has(Number(t.player_2_id))
                        return (
                          <option
                            key={t.id}
                            value={String(t.id)}
                            disabled={
                              optionTaken(Number(t.id), fillTeamB, [fillTeamA]) || busy
                            }
                          >
                            {labelTeamPair(t.player_1_id, t.player_2_id, t.name)}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="text-xs font-bold">
                    Игрок A
                    <select
                      value={fA === '' ? '' : String(fA)}
                      onChange={(e) => setFA(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {rosterPlayers.map((p) => (
                        <option
                          key={p.id}
                          value={String(p.id)}
                          disabled={
                            optionTaken(Number(p.id), fA, [fB]) ||
                            isPlayoffPlayerDisabledInSelect(
                              playoffBusyElsewhere,
                              fA,
                              Number(p.id)
                            )
                          }
                        >
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold">
                    Игрок B
                    <select
                      value={fB === '' ? '' : String(fB)}
                      onChange={(e) => setFB(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                    >
                      <option value="">—</option>
                      {rosterPlayers.map((p) => (
                        <option
                          key={p.id}
                          value={String(p.id)}
                          disabled={
                            optionTaken(Number(p.id), fB, [fA]) ||
                            isPlayoffPlayerDisabledInSelect(
                              playoffBusyElsewhere,
                              fB,
                              Number(p.id)
                            )
                          }
                        >
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="text-xs font-bold">
                Счёт A
                <input
                  type="number"
                  min={0}
                  value={fScoreA}
                  onChange={(e) => setFScoreA(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                />
              </label>
              <label className="text-xs font-bold">
                Счёт B
                <input
                  type="number"
                  min={0}
                  value={fScoreB}
                  onChange={(e) => setFScoreB(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={fCompleted}
                onChange={(e) => setFCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-2 border-[var(--ink)]"
              />
              Матч завершён
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] px-4 py-2 text-sm font-bold text-[var(--cream)]"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setRosterFormErr(null)
                  setFillMatchId('')
                  setFA('')
                  setFA2('')
                  setFB('')
                  setFB2('')
                  setFillTeamA('')
                  setFillTeamB('')
                  setFScoreA(0)
                  setFScoreB(0)
                  setFCompleted(false)
                }}
                className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-sm font-bold"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
