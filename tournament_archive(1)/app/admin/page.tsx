'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Theme } from 'emoji-picker-react'
import { supabase } from '@/lib/supabaseClient'
import type { Group, Match, Player, Tournament } from '@/lib/types'
import {
  buildMixedPlayoffPlan,
  buildPlayoffBracketPlan,
  buildPlayoffDoublesBracketSkeleton,
  type PlayoffDoublesTeam,
  roundRobinPairs,
  tierSizesForBracket,
} from '@/lib/bracket'
import { validateDoublesMatchRoster } from '@/lib/doublesRoster'
import { insertBracketInTiers } from '@/lib/bracketInsert'
import {
  CLUSTER_COOKIE_MAX_AGE,
  CLUSTER_COOKIE_NAME,
  CLUSTER_COOKIE_VALUE_ALL,
  parseClusterSelection,
} from '@/lib/cluster'
import { deleteGroupCascade, deleteTournamentCascade } from '@/lib/adminDelete'
import { isDoublesParticipantType } from '@/lib/participantType'
import {
  computeStandings,
  isPlayoffBracketMatch,
  isRoundRobinMatch,
  tournamentPlayers,
} from '@/lib/stats'

const EmojiPicker = dynamic(
  () => import('emoji-picker-react').then((m) => m.default),
  { ssr: false }
)

function readClusterCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const row = document.cookie
    .split('; ')
    .find((r) => r.startsWith(`${CLUSTER_COOKIE_NAME}=`))
  const v = row?.split('=').slice(1).join('=')
  return v != null ? decodeURIComponent(v) : undefined
}

function writeClusterCookie(id: number) {
  document.cookie = `${CLUSTER_COOKIE_NAME}=${id}; path=/; max-age=${CLUSTER_COOKIE_MAX_AGE}; SameSite=Lax`
}

function writeClusterCookieAll() {
  document.cookie = `${CLUSTER_COOKIE_NAME}=${CLUSTER_COOKIE_VALUE_ALL}; path=/; max-age=${CLUSTER_COOKIE_MAX_AGE}; SameSite=Lax`
}

function formatSupabaseError(err: {
  message: string
  code?: string
  details?: string
  hint?: string
}): string {
  const parts = [err.message]
  if (err.details) parts.push(`Детали: ${err.details}`)
  if (err.hint) parts.push(`Подсказка: ${err.hint}`)
  if (err.code) parts.push(`Код: ${err.code}`)
  return parts.join('\n')
}

function formatUnknownSupabaseErr(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return formatSupabaseError(err as Parameters<typeof formatSupabaseError>[0])
  }
  if (err instanceof Error) return err.message
  return 'Ошибка при создании матчей'
}

type AdminTab = 'clusters' | 'players' | 'tournaments' | 'matches'

const ADMIN_TABS: { id: AdminTab; label: string; emoji: string }[] = [
  { id: 'clusters', label: 'Кластеры', emoji: '🏠' },
  { id: 'players', label: 'Игроки', emoji: '👤' },
  { id: 'tournaments', label: 'Турниры', emoji: '🏆' },
  { id: 'matches', label: 'Матчи', emoji: '⚡' },
]

export default function AdminPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('🎾')
  const [showPicker, setShowPicker] = useState(false)

  const [tName, setTName] = useState('')
  const [tDesc, setTDesc] = useState('')
  const [tDate, setTDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [tFormat, setTFormat] = useState('round_robin')
  const [tPart, setTPart] = useState<'single' | 'double'>('single')
  const [playoffSize, setPlayoffSize] = useState<4 | 8 | 16>(8)
  const [mixedAdvancers, setMixedAdvancers] = useState<2 | 4>(4)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([])

  const [matchTournamentId, setMatchTournamentId] = useState<number | ''>('')
  const [mixedPlayoffTournamentId, setMixedPlayoffTournamentId] = useState<
    number | ''
  >('')
  const [matchA, setMatchA] = useState<number | ''>('')
  const [matchA2, setMatchA2] = useState<number | ''>('')
  const [matchB, setMatchB] = useState<number | ''>('')
  const [matchB2, setMatchB2] = useState<number | ''>('')
  const [assignTournamentId, setAssignTournamentId] = useState<number | ''>('')
  const [assignMatchId, setAssignMatchId] = useState<number | ''>('')
  const [assignA, setAssignA] = useState<number | ''>('')
  const [assignA2, setAssignA2] = useState<number | ''>('')
  const [assignB, setAssignB] = useState<number | ''>('')
  const [assignB2, setAssignB2] = useState<number | ''>('')
  const [assignMatches, setAssignMatches] = useState<Match[]>([])
  const [tab, setTab] = useState<AdminTab>('clusters')

  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editGroupName, setEditGroupName] = useState('')

  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null)
  const [editPlayerName, setEditPlayerName] = useState('')
  const [editPlayerEmoji, setEditPlayerEmoji] = useState('🎾')
  const [showEditPlayerPicker, setShowEditPlayerPicker] = useState(false)

  const [editingTournamentId, setEditingTournamentId] = useState<number | null>(
    null
  )
  const [editTourName, setEditTourName] = useState('')
  const [editTourDesc, setEditTourDesc] = useState('')
  const [editTourDate, setEditTourDate] = useState('')
  const [editTourStatus, setEditTourStatus] = useState<'active' | 'archived'>(
    'active'
  )

  const [rrListTournamentId, setRrListTournamentId] = useState<number | ''>('')
  const [rrMatches, setRrMatches] = useState<Match[]>([])
  const [editingRrMatchId, setEditingRrMatchId] = useState<number | ''>('')
  const [editRrA, setEditRrA] = useState<number | ''>('')
  const [editRrA2, setEditRrA2] = useState<number | ''>('')
  const [editRrB, setEditRrB] = useState<number | ''>('')
  const [editRrB2, setEditRrB2] = useState<number | ''>('')

  const loadGroupData = useCallback(async () => {
    if (groupId == null) return
    setLoading(true)
    const [{ data: p }, { data: tour }] = await Promise.all([
      supabase.from('players').select('*').eq('group_id', groupId).order('name'),
      supabase
        .from('tournaments')
        .select('*')
        .eq('group_id', groupId)
        .order('scheduled_date', { ascending: false }),
    ])
    setPlayers((p ?? []) as Player[])
    setTournaments((tour ?? []) as Tournament[])
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    void (async () => {
      const { data: g } = await supabase.from('groups').select('*').order('id')
      const list = (g ?? []) as Group[]
      setGroups(list)
      const sel = parseClusterSelection(list, readClusterCookie())
      // «Общее» на сайте — в админке без явного выбора кластера не создаём сущности
      setGroupId(sel === 'all' ? null : sel)
    })()
  }, [])

  useEffect(() => {
    if (groupId == null) {
      setPlayers([])
      setTournaments([])
      setLoading(false)
      return
    }
    void loadGroupData()
  }, [groupId, loadGroupData])

  useEffect(() => {
    if (assignTournamentId === '' || groupId == null) {
      setAssignMatches([])
      return
    }
    void (async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', assignTournamentId)
        .order('round_index', { ascending: true })
        .order('bracket_order', { ascending: true })
      if (error) {
        setMsg(error.message)
        return
      }
      const list = (data ?? []) as Match[]
      setAssignMatches(list.filter(isPlayoffBracketMatch))
    })()
  }, [assignTournamentId, groupId])

  useEffect(() => {
    if (assignMatchId === '') {
      setAssignA('')
      setAssignA2('')
      setAssignB('')
      setAssignB2('')
      return
    }
    const m = assignMatches.find((x) => x.id === assignMatchId)
    if (!m) return
    setAssignA(m.player_a_id ?? '')
    setAssignA2(m.player_a2_id ?? '')
    setAssignB(m.player_b_id ?? '')
    setAssignB2(m.player_b2_id ?? '')
  }, [assignMatchId, assignMatches])

  useEffect(() => {
    if (rrListTournamentId === '' || groupId == null) {
      setRrMatches([])
      setEditingRrMatchId('')
      setEditRrA('')
      setEditRrA2('')
      setEditRrB('')
      setEditRrB2('')
      return
    }
    void (async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', rrListTournamentId)
        .order('bracket_order', { ascending: true })
      if (error) {
        setMsg(error.message)
        return
      }
      const list = (data ?? []) as Match[]
      setRrMatches(list.filter(isRoundRobinMatch))
      setEditingRrMatchId('')
      setEditRrA('')
      setEditRrA2('')
      setEditRrB('')
      setEditRrB2('')
    })()
  }, [rrListTournamentId, groupId])

  function applyMatchDefaultsForTournament(tid: number | '') {
    if (tid === '') {
      setMatchA('')
      setMatchB('')
      setMatchA2('')
      setMatchB2('')
      return
    }
    const tour = tournaments.find((t) => t.id === tid)
    const pids = tour?.participant_ids
    const dbl = isDoublesParticipantType(tour?.participant_type ?? 'single')
    if (!pids?.length) {
      setMatchA('')
      setMatchB('')
      setMatchA2('')
      setMatchB2('')
      return
    }
    if (dbl && pids.length >= 4) {
      setMatchA(pids[0]!)
      setMatchA2(pids[1]!)
      setMatchB(pids[2]!)
      setMatchB2(pids[3]!)
    } else if (!dbl && pids.length >= 2) {
      setMatchA(pids[0]!)
      setMatchB(pids[1]!)
      setMatchA2('')
      setMatchB2('')
    } else {
      setMatchA('')
      setMatchB('')
      setMatchA2('')
      setMatchB2('')
    }
  }

  function selectCluster(id: number) {
    writeClusterCookie(id)
    setGroupId(id)
    router.refresh()
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!newGroupName.trim()) {
      setMsg('Введите название группы')
      return
    }
    const { error } = await supabase
      .from('groups')
      .insert({ name: newGroupName.trim() })
    if (error) {
      setMsg(error.message)
      return
    }
    setNewGroupName('')
    const { data: g } = await supabase.from('groups').select('*').order('id')
    const list = (g ?? []) as Group[]
    setGroups(list)
    setMsg('Группа создана ✅')
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) return
    if (!newName.trim()) {
      setMsg('Введите имя игрока')
      return
    }
    const { error } = await supabase.from('players').insert({
      group_id: groupId,
      name: newName.trim(),
      avatar_emoji: newEmoji || '🎾',
    })
    if (error) {
      setMsg(error.message)
      return
    }
    setNewName('')
    setNewEmoji('🎾')
    setShowPicker(false)
    setMsg('Игрок добавлен ✅')
    void loadGroupData()
  }

  function toggleParticipant(id: number) {
    setSelectedPlayerIds((prev) => {
      const i = prev.indexOf(id)
      if (i >= 0) return prev.filter((x) => x !== id)
      const max =
        tFormat === 'playoff'
          ? tPart === 'double'
            ? playoffSize * 2
            : playoffSize
          : Number.POSITIVE_INFINITY
      if (prev.length >= max) return prev
      return [...prev, id]
    })
  }

  function moveSeed(index: number, dir: -1 | 1) {
    setSelectedPlayerIds((prev) => {
      if (tFormat === 'playoff' && tPart === 'double') {
        const pairIdx = Math.floor(index / 2)
        const neighborPair = pairIdx + dir
        if (neighborPair < 0 || neighborPair * 2 + 1 >= prev.length) return prev
        const base = pairIdx * 2
        const nb = neighborPair * 2
        const next = [...prev]
        const a0 = next[base]!
        const a1 = next[base + 1]!
        const b0 = next[nb]!
        const b1 = next[nb + 1]!
        next[base] = b0
        next[base + 1] = b1
        next[nb] = a0
        next[nb + 1] = a1
        return next
      }
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[index]!
      next[index] = next[j]!
      next[j] = t
      return next
    })
  }

  function playoffDoublesTeamsFromSelection(): PlayoffDoublesTeam[] {
    const teams: PlayoffDoublesTeam[] = []
    for (let i = 0; i < playoffSize; i++) {
      const player_1_id = selectedPlayerIds[2 * i]!
      const player_2_id = selectedPlayerIds[2 * i + 1]!
      teams.push({ id: i, player_1_id, player_2_id })
    }
    return teams
  }

  async function createTournament(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) {
      setMsg('Сначала выберите кластер во вкладке «Кластеры».')
      return
    }
    if (!tName.trim()) {
      setMsg('Название турнира обязательно')
      return
    }

    let playoff_bracket_size: number | null = null
    let playoff_advancers: number | null = null
    let participant_ids: number[] | null = null

    if (tFormat === 'playoff') {
      playoff_bracket_size = playoffSize
      if (tPart === 'double') {
        const need = playoffSize * 2
        const n = selectedPlayerIds.length
        if (n !== 0 && n !== need) {
          setMsg(
            `Парный плей-офф: при создании можно не выбирать игроков (пары назначаются в матчах). Если задаёте состав заранее — выберите ровно ${playoffSize} пар (${need} кликов). Сейчас выбрано: ${n}.`
          )
          return
        }
        participant_ids =
          n === 0
            ? null
            : playoffDoublesTeamsFromSelection().flatMap((t) => [
                t.player_1_id,
                t.player_2_id,
              ])
      } else {
        if (selectedPlayerIds.length !== playoffSize) {
          setMsg(
            `Для одиночного плей-оффа выберите ровно ${playoffSize} участников (порядок = посев 1…${playoffSize}).`
          )
          return
        }
        participant_ids = [...selectedPlayerIds]
      }
    } else if (tFormat === 'mixed') {
      if (selectedPlayerIds.length < 2) {
        setMsg('Смешанный формат: минимум 2 участника.')
        return
      }
      if (selectedPlayerIds.length < mixedAdvancers) {
        setMsg(
          `Нужно не меньше участников, чем выходит в плей-офф (${mixedAdvancers}).`
        )
        return
      }
      playoff_advancers = mixedAdvancers
      participant_ids = [...selectedPlayerIds]
    }

    const participant_type = tPart

    const tournamentPayload = {
      group_id: groupId,
      name: tName.trim(),
      description: tDesc.trim() || null,
      scheduled_date: tDate,
      format: tFormat,
      participant_type,
      status: 'active' as const,
      playoff_bracket_size,
      playoff_advancers,
      participant_ids,
    }

    console.log('[admin createTournament] insert payload', tournamentPayload)

    const { data: created, error } = await supabase
      .from('tournaments')
      .insert(tournamentPayload)
      .select('id')
      .single()

    if (error) {
      console.error('[admin createTournament]', error)
      setMsg(formatSupabaseError(error))
      return
    }

    const tid = created!.id as number

    try {
      if (tFormat === 'playoff') {
        const { rows, parentLinks } =
          tPart === 'double'
            ? buildPlayoffDoublesBracketSkeleton(tid, playoffSize)
            : buildPlayoffBracketPlan(tid, playoffSize, {
                mode: 'singles',
                playerIds: selectedPlayerIds,
              })
        await insertBracketInTiers(
          rows,
          parentLinks,
          tierSizesForBracket(playoffSize)
        )
      } else if (tFormat === 'mixed') {
        const pairs = roundRobinPairs(selectedPlayerIds)
        const rows = pairs.map(([a, b], i) => ({
          tournament_id: tid,
          player_a_id: a,
          player_a2_id: null,
          player_b_id: b,
          player_b2_id: null,
          score_a: 0,
          score_b: 0,
          status: 'scheduled',
          round: 'round_robin',
          round_index: 0,
          bracket_order: i,
          parent_a_match_id: null,
          parent_b_match_id: null,
        }))
        const { error: me } = await supabase.from('matches').insert(rows)
        if (me) throw new Error(me.message)
      }
    } catch (err: unknown) {
      console.error('[admin createTournament] этап матчей / сетки', err)
      const detail = formatUnknownSupabaseErr(err)
      const rollbackErr = await deleteTournamentCascade(supabase, tid)
      setMsg(
        `${detail}${
          rollbackErr
            ? `\n\nНе удалось убрать черновик турнира из БД: ${rollbackErr} (id ${tid}).`
            : `\n\nЧерновик турнира удалён. Частые причины: нет колонок player_a2_id/player_b2_id в matches (файл supabase/migrations/20260420160000_match_doubles_players.sql) или ограничение participant_type (20260420150000_participant_type_supabase.sql).`
        }`
      )
      void loadGroupData()
      return
    }

    setTName('')
    setTDesc('')
    setSelectedPlayerIds([])

    let matchNote = ''
    if (tFormat === 'playoff' || tFormat === 'mixed') {
      const { count, error: cErr } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tid)
      if (!cErr && count != null) {
        matchNote = ` · матчей в БД: ${count}`
      }
    }
    setMsg(`Турнир создан 🏆${matchNote}`)
    void loadGroupData()
  }

  async function generateMixedPlayoff(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) return
    if (mixedPlayoffTournamentId === '') {
      setMsg('Выберите турнир')
      return
    }
    const tid = mixedPlayoffTournamentId

    const { data: tourRaw, error: te } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tid)
      .single()
    if (te || !tourRaw) {
      setMsg(te?.message ?? 'Турнир не найден')
      return
    }
    const tour = tourRaw as Tournament
    if (tour.group_id !== groupId) {
      setMsg('Турнир не из текущей группы.')
      return
    }
    if (tour.format !== 'mixed') {
      setMsg('Только для турниров со смешанным форматом.')
      return
    }

    const { data: mraw, error: me } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tid)
    if (me) {
      setMsg(me.message)
      return
    }
    const allMatches = (mraw ?? []) as Match[]

    const hasKo = allMatches.some(
      (m) => m.round != null && m.round !== 'round_robin'
    )
    if (hasKo) {
      setMsg('Плей-офф для этого турнира уже создан.')
      return
    }

    const rr = allMatches.filter(isRoundRobinMatch)
    if (rr.length === 0) {
      setMsg('Нет матчей кругового этапа.')
      return
    }
    if (rr.some((m) => m.status !== 'completed')) {
      setMsg('Завершите все матчи круговой стадии перед плей-оффом.')
      return
    }

    const rawPid = tour.participant_ids as unknown
    const pids = Array.isArray(rawPid)
      ? (rawPid as unknown[]).map((x) => Number(x))
      : []
    if (pids.length === 0) {
      setMsg('У турнира нет списка участников.')
      return
    }

    const { data: prows, error: pe } = await supabase
      .from('players')
      .select('*')
      .in('id', pids)
    if (pe) {
      setMsg(pe.message)
      return
    }
    const scopePlayers = (prows ?? []) as Player[]
    const advN = (tour.playoff_advancers ?? 4) as 2 | 4
    const standings = computeStandings(scopePlayers, rr)
    const top = standings.slice(0, advN).map((s) => s.id)

    if (top.length < advN) {
      setMsg('Не удалось набрать нужное число участников для плей-оффа.')
      return
    }

    try {
      const { rows, parentLinks } = buildMixedPlayoffPlan(tid, advN, top)
      const tiers = advN === 2 ? [1] : [2, 1]
      await insertBracketInTiers(rows, parentLinks, tiers)
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Ошибка плей-оффа')
      return
    }

    setMsg('Плей-офф сформирован 🏆')
    void loadGroupData()
  }

  async function addMatch(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) return
    const selTour = tournaments.find((t) => t.id === matchTournamentId)
    const dbl = isDoublesParticipantType(selTour?.participant_type ?? 'single')
    if (matchTournamentId === '' || matchA === '' || matchB === '') {
      setMsg('Выберите турнир и игроков')
      return
    }
    if (dbl) {
      if (matchA2 === '' || matchB2 === '') {
        setMsg('Парный турнир: укажите по два игрока на каждую сторону (команда A и B).')
        return
      }
    }
    const ids: number[] = dbl
      ? [Number(matchA), Number(matchA2), Number(matchB), Number(matchB2)]
      : [Number(matchA), Number(matchB)]
    if (new Set(ids).size !== ids.length) {
      setMsg('Все игроки в матче должны быть разными.')
      return
    }
    if (selTour?.participant_ids?.length) {
      const allowed = new Set(selTour.participant_ids)
      for (const id of ids) {
        if (!allowed.has(id)) {
          setMsg(
            'Выберите только игроков из состава турнира (те же, что при создании турнира).'
          )
          return
        }
      }
    }

    const { data: boRows, error: boErr } = await supabase
      .from('matches')
      .select('bracket_order')
      .eq('tournament_id', matchTournamentId)
    if (boErr) {
      setMsg(boErr.message)
      return
    }
    const maxBo = Math.max(
      0,
      ...(boRows ?? []).map((r) => Number((r as { bracket_order?: number }).bracket_order ?? 0))
    )

    const { error } = await supabase.from('matches').insert({
      tournament_id: matchTournamentId,
      player_a_id: matchA,
      player_a2_id: dbl ? matchA2 : null,
      player_b_id: matchB,
      player_b2_id: dbl ? matchB2 : null,
      score_a: 0,
      score_b: 0,
      status: 'scheduled',
      round: 'round_robin',
      round_index: 0,
      bracket_order: maxBo + 1,
      parent_a_match_id: null,
      parent_b_match_id: null,
    })
    if (error) {
      setMsg(error.message)
      return
    }
    applyMatchDefaultsForTournament(matchTournamentId)
    setMsg('Матч добавлен 🎾')
    void loadGroupData()
  }

  async function refreshAssignMatchesList(tid: number) {
    const { data: refreshed, error: reErr } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tid)
      .order('round_index', { ascending: true })
      .order('bracket_order', { ascending: true })
    if (!reErr) {
      setAssignMatches(
        ((refreshed ?? []) as Match[]).filter(isPlayoffBracketMatch)
      )
    }
  }

  async function assignPlayoffRoster(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) return
    if (assignTournamentId === '' || assignMatchId === '') {
      setMsg('Выберите турнир и матч сетки.')
      return
    }
    const tour = tournaments.find((t) => t.id === assignTournamentId)
    const dbl = isDoublesParticipantType(tour?.participant_type ?? 'single')

    let payload: {
      player_a_id: number | null
      player_a2_id: number | null
      player_b_id: number | null
      player_b2_id: number | null
    }

    if (dbl) {
      if (assignA === '' || assignA2 === '' || assignB === '' || assignB2 === '') {
        setMsg('Укажите по двое игроков на команду A и B.')
        return
      }
      const v = validateDoublesMatchRoster(
        Number(assignA),
        Number(assignA2),
        Number(assignB),
        Number(assignB2)
      )
      if (v) {
        setMsg(v)
        return
      }
      if (tour?.participant_ids?.length) {
        const allowed = new Set(tour.participant_ids)
        for (const id of [
          Number(assignA),
          Number(assignA2),
          Number(assignB),
          Number(assignB2),
        ]) {
          if (!allowed.has(id)) {
            setMsg('Все четыре игрока должны входить в состав турнира.')
            return
          }
        }
      }
      payload = {
        player_a_id: Number(assignA),
        player_a2_id: Number(assignA2),
        player_b_id: Number(assignB),
        player_b2_id: Number(assignB2),
      }
    } else {
      if (assignA === '' || assignB === '') {
        setMsg('Укажите игрока A и игрока B.')
        return
      }
      if (assignA === assignB) {
        setMsg('Игроки A и B должны быть разными.')
        return
      }
      if (tour?.participant_ids?.length) {
        const allowed = new Set(tour.participant_ids)
        for (const id of [Number(assignA), Number(assignB)]) {
          if (!allowed.has(id)) {
            setMsg('Оба игрока должны входить в состав турнира.')
            return
          }
        }
      }
      payload = {
        player_a_id: Number(assignA),
        player_a2_id: null,
        player_b_id: Number(assignB),
        player_b2_id: null,
      }
    }

    const { error } = await supabase
      .from('matches')
      .update(payload)
      .eq('id', assignMatchId)
    if (error) {
      setMsg(error.message)
      return
    }

    const tid = assignTournamentId as number
    await refreshAssignMatchesList(tid)

    setAssignMatchId('')
    setAssignA('')
    setAssignA2('')
    setAssignB('')
    setAssignB2('')

    setMsg('Состав матча сохранён ✅ Форма сброшена — выберите следующий матч.')
    void loadGroupData()
  }

  async function clearPlayoffCellRoster() {
    setMsg(null)
    if (groupId == null) return
    if (assignTournamentId === '' || assignMatchId === '') {
      setMsg('Выберите турнир и матч сетки.')
      return
    }
    const m = assignMatches.find((x) => x.id === assignMatchId)
    if (!m) return
    if (m.status === 'completed') {
      setMsg('Нельзя очистить состав завершённого матча.')
      return
    }
    if (
      !confirm(
        'Очистить всех участников в этой ячейке сетки? Счёт и статус не меняются.'
      )
    )
      return
    const { error } = await supabase
      .from('matches')
      .update({
        player_a_id: null,
        player_a2_id: null,
        player_b_id: null,
        player_b2_id: null,
      })
      .eq('id', assignMatchId)
    if (error) {
      setMsg(error.message)
      return
    }
    await refreshAssignMatchesList(assignTournamentId as number)
    setAssignMatchId('')
    setAssignA('')
    setAssignA2('')
    setAssignB('')
    setAssignB2('')
    setMsg('Состав ячейки очищен.')
    void loadGroupData()
  }

  async function saveGroupEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (editingGroupId == null || !editGroupName.trim()) {
      setMsg('Введите название кластера.')
      return
    }
    const { error } = await supabase
      .from('groups')
      .update({ name: editGroupName.trim() })
      .eq('id', editingGroupId)
    if (error) {
      setMsg(error.message)
      return
    }
    const { data: g } = await supabase.from('groups').select('*').order('id')
    setGroups((g ?? []) as Group[])
    setEditingGroupId(null)
    setEditGroupName('')
    setMsg('Кластер обновлён ✅')
  }

  async function savePlayerEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (editingPlayerId == null || !editPlayerName.trim()) {
      setMsg('Введите имя игрока.')
      return
    }
    const { error } = await supabase
      .from('players')
      .update({
        name: editPlayerName.trim(),
        avatar_emoji: editPlayerEmoji || '🎾',
      })
      .eq('id', editingPlayerId)
    if (error) {
      setMsg(error.message)
      return
    }
    setEditingPlayerId(null)
    setShowEditPlayerPicker(false)
    setMsg('Игрок обновлён ✅')
    void loadGroupData()
  }

  async function saveTournamentEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (editingTournamentId == null || !editTourName.trim()) {
      setMsg('Введите название турнира.')
      return
    }
    const { error } = await supabase
      .from('tournaments')
      .update({
        name: editTourName.trim(),
        description: editTourDesc.trim() || null,
        scheduled_date: editTourDate,
        status: editTourStatus,
      })
      .eq('id', editingTournamentId)
    if (error) {
      setMsg(error.message)
      return
    }
    setEditingTournamentId(null)
    setMsg('Турнир обновлён ✅')
    void loadGroupData()
  }

  async function saveRoundRobinMatchEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null || rrListTournamentId === '' || editingRrMatchId === '')
      return
    const tour = tournaments.find((t) => t.id === rrListTournamentId)
    if (!tour || tour.group_id !== groupId) {
      setMsg('Турнир не из текущего кластера.')
      return
    }
    const dbl = isDoublesParticipantType(tour.participant_type ?? 'single')
    if (dbl) {
      if (editRrA === '' || editRrA2 === '' || editRrB === '' || editRrB2 === '') {
        setMsg('В парном матче укажите по двое на каждую сторону.')
        return
      }
      const v = validateDoublesMatchRoster(
        Number(editRrA),
        Number(editRrA2),
        Number(editRrB),
        Number(editRrB2)
      )
      if (v) {
        setMsg(v)
        return
      }
    } else {
      if (editRrA === '' || editRrB === '') {
        setMsg('Укажите игрока A и B.')
        return
      }
      if (editRrA === editRrB) {
        setMsg('Игроки должны быть разными.')
        return
      }
    }
    if (tour.participant_ids?.length) {
      const allowed = new Set(tour.participant_ids)
      const ids = dbl
        ? [Number(editRrA), Number(editRrA2), Number(editRrB), Number(editRrB2)]
        : [Number(editRrA), Number(editRrB)]
      for (const id of ids) {
        if (!allowed.has(id)) {
          setMsg('Игроки должны входить в состав турнира.')
          return
        }
      }
    }

    const payload = dbl
      ? {
          player_a_id: Number(editRrA),
          player_a2_id: Number(editRrA2),
          player_b_id: Number(editRrB),
          player_b2_id: Number(editRrB2),
        }
      : {
          player_a_id: Number(editRrA),
          player_a2_id: null,
          player_b_id: Number(editRrB),
          player_b2_id: null,
        }

    const { error } = await supabase
      .from('matches')
      .update(payload)
      .eq('id', editingRrMatchId)
    if (error) {
      setMsg(error.message)
      return
    }
    const { data, error: reErr } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', rrListTournamentId)
      .order('bracket_order', { ascending: true })
    if (!reErr) {
      setRrMatches(((data ?? []) as Match[]).filter(isRoundRobinMatch))
    }
    setEditingRrMatchId('')
    setEditRrA('')
    setEditRrA2('')
    setEditRrB('')
    setEditRrB2('')
    setMsg('Матч обновлён ✅')
    void loadGroupData()
  }

  async function deleteMatchAdmin(matchId: number, tournamentId: number) {
    setMsg(null)
    if (groupId == null) return
    const tour = tournaments.find((t) => t.id === tournamentId)
    if (!tour || tour.group_id !== groupId) {
      setMsg('Турнир не из текущего кластера.')
      return
    }
    if (
      !confirm(
        'Удалить этот матч из базы? Для ячеек плей-оффа это возможно только если на них никто не ссылается (нет «дочерних» матчей сетки).'
      )
    )
      return

    const { data: children, error: chErr } = await supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .or(
        `parent_a_match_id.eq.${matchId},parent_b_match_id.eq.${matchId}`
      )
      .limit(5)
    if (chErr) {
      setMsg(chErr.message)
      return
    }
    if (children && children.length > 0) {
      setMsg(
        'Удаление отменено: на эту ячейку ссылаются другие матчи сетки. Удалите весь турнир во вкладке «Турниры» или обратитесь к администратору БД.'
      )
      return
    }

    const { error } = await supabase.from('matches').delete().eq('id', matchId)
    if (error) {
      setMsg(error.message)
      return
    }

    if (assignTournamentId === tournamentId) {
      await refreshAssignMatchesList(tournamentId)
      if (assignMatchId === matchId) {
        setAssignMatchId('')
        setAssignA('')
        setAssignA2('')
        setAssignB('')
        setAssignB2('')
      }
    }
    if (rrListTournamentId === tournamentId) {
      const { data, error: reErr } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('bracket_order', { ascending: true })
      if (!reErr) {
        setRrMatches(((data ?? []) as Match[]).filter(isRoundRobinMatch))
      }
      if (editingRrMatchId === matchId) {
        setEditingRrMatchId('')
        setEditRrA('')
        setEditRrA2('')
        setEditRrB('')
        setEditRrB2('')
      }
    }
    if (matchTournamentId === tournamentId) applyMatchDefaultsForTournament(tournamentId)

    setMsg('Матч удалён.')
    void loadGroupData()
  }

  async function removePlayer(id: number) {
    if (!confirm('Удалить игрока? Связанные матчи могут помешать.')) return
    setMsg(null)
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) {
      setMsg(error.message)
      return
    }
    setMsg('Игрок удалён')
    void loadGroupData()
  }

  async function removeTournament(id: number) {
    if (
      !confirm(
        'Удалить турнир и все его матчи? Действие необратимо.'
      )
    )
      return
    setMsg(null)
    const err = await deleteTournamentCascade(supabase, id)
    if (err) {
      setMsg(err)
      return
    }
    if (matchTournamentId === id) setMatchTournamentId('')
    if (mixedPlayoffTournamentId === id) setMixedPlayoffTournamentId('')
    if (assignTournamentId === id) {
      setAssignTournamentId('')
      setAssignMatchId('')
    }
    setMsg('Турнир удалён')
    void loadGroupData()
  }

  async function removeGroup(id: number) {
    if (
      !confirm(
        'Удалить кластер целиком: все турниры, матчи и игроки этой группы? Действие необратимо.'
      )
    )
      return
    setMsg(null)
    const err = await deleteGroupCascade(supabase, id)
    if (err) {
      setMsg(err)
      return
    }
    const { data: g } = await supabase.from('groups').select('*').order('id')
    const list = (g ?? []) as Group[]
    setGroups(list)
    if (groupId === id) {
      const next = list[0]?.id ?? null
      setGroupId(next)
      if (next != null) {
        writeClusterCookie(next)
      } else {
        writeClusterCookieAll()
      }
      router.refresh()
    }
    setMsg('Кластер удалён')
    if (groupId !== id) void loadGroupData()
  }

  const currentGroupName =
    groupId != null ? groups.find((g) => g.id === groupId)?.name : null

  const navClusterSel =
    groups.length > 0
      ? parseClusterSelection(groups, readClusterCookie())
      : 'all'

  const matchFormDoubles =
    matchTournamentId !== '' &&
    isDoublesParticipantType(
      tournaments.find((x) => x.id === matchTournamentId)?.participant_type ??
        'single'
    )

  const matchRosterPlayers = useMemo(() => {
    if (matchTournamentId === '') return players
    const tour = tournaments.find((t) => t.id === matchTournamentId)
    const pids = tour?.participant_ids
    if (!pids?.length) return players
    const set = new Set(pids)
    return players.filter((p) => set.has(p.id))
  }, [matchTournamentId, tournaments, players])

  const assignTour = useMemo(
    () =>
      assignTournamentId === ''
        ? undefined
        : tournaments.find((t) => t.id === assignTournamentId),
    [assignTournamentId, tournaments]
  )

  const assignRosterPlayers = useMemo(
    () => (assignTour ? tournamentPlayers(assignTour, players) : players),
    [assignTour, players]
  )

  const assignPlayoffDoubles = Boolean(
    assignTour && isDoublesParticipantType(assignTour.participant_type ?? 'single')
  )

  const rrTour = useMemo(
    () =>
      rrListTournamentId === ''
        ? undefined
        : tournaments.find((t) => t.id === rrListTournamentId),
    [rrListTournamentId, tournaments]
  )

  const rrRosterPlayers = useMemo(
    () => (rrTour ? tournamentPlayers(rrTour, players) : players),
    [rrTour, players]
  )

  const rrFormDoubles =
    rrTour != null &&
    isDoublesParticipantType(rrTour.participant_type ?? 'single')

  function playerLabel(id: number | null | undefined): string {
    if (id == null) return '—'
    const p = players.find((x) => x.id === id)
    return p ? `${p.avatar_emoji} ${p.name}` : `#${id}`
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)] sm:text-4xl">
          Админ-панель 🛠️
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Схема{' '}
          <code className="rounded bg-[var(--surface-2)] px-1">tournament</code>
          · игроки и турниры создаются только в том кластере, который вы нажали
          «Выбрать» ниже (это же пишется в cookie «Кластер» в шапке сайта).
        </p>
        {currentGroupName && groupId != null && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/35 px-3 py-2 text-sm font-bold text-[var(--ink)]">
            <span>🏠</span> Редактируете кластер: {currentGroupName}
            <span className="text-xs font-mono font-normal text-[var(--ink-muted)]">
              id {groupId}
            </span>
          </p>
        )}
        {groupId == null && groups.length > 0 && (
          <div className="mt-3 rounded-xl border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
            {navClusterSel === 'all' ? (
              <>
                На сайте в шапке выбрано{' '}
                <strong>«Общее — все кластеры»</strong> (или кластер ещё не
                зафиксирован). Чтобы создать турнир или игрока, откройте вкладку{' '}
                <strong>«Кластеры»</strong> и нажмите <strong>«Выбрать»</strong> у
                нужной группы — новые сущности попадут только туда.
              </>
            ) : (
              <>
                Выберите кластер во вкладке «Кластеры», чтобы загрузить игроков и
                турниры.
              </>
            )}
          </div>
        )}
      </header>

      {msg && (
        <p className="mb-6 whitespace-pre-wrap rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-3 text-sm font-bold text-[var(--ink)]">
          {msg}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          aria-label="Разделы админки"
          className="flex gap-2 overflow-x-auto border-b-2 border-[var(--ink)] pb-3 lg:w-52 lg:flex-shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r-2 lg:pb-0 lg:pr-4"
        >
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-xl border-2 border-[var(--ink)] px-3 py-2.5 text-left text-sm font-black transition lg:w-full ${
                tab === t.id
                  ? 'bg-[var(--lime)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]'
                  : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <span className="mr-1.5">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-8">
          {tab === 'clusters' && (
            <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
              <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                Кластеры 🏠
              </h2>
              <p className="mb-4 text-sm text-[var(--ink-muted)]">
                Кнопка «Выбрать» задаёт активный кластер для админки и совпадает с
                селектором «Кластер» в шапке сайта (одна и та же cookie).
              </p>
              {groups.length > 0 && navClusterSel === 'all' && (
                <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/90 px-3 py-2 text-sm font-bold text-[var(--ink)]">
                  Сейчас на сайте включён режим <strong>«Общее»</strong> — пока
                  не нажмёте «Выбрать» у кластера, создавать турниры и игроков
                  нельзя (неясно, в какую группу их класть).
                </p>
              )}
              <form
                onSubmit={(e) => void createGroup(e)}
                className="mb-6 flex flex-wrap items-end gap-2 border-b-2 border-[var(--ink)]/15 pb-6"
              >
                <label className="min-w-[200px] flex-1 text-sm font-bold">
                  Новый кластер
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Название"
                    className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2.5 text-sm font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
                >
                  Создать
                </button>
              </form>
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
                  >
                    {editingGroupId === g.id ? (
                      <form
                        onSubmit={(e) => void saveGroupEdit(e)}
                        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                      >
                        <label className="min-w-[180px] flex-1 text-sm font-bold">
                          Название
                          <input
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(null)
                              setEditGroupName('')
                            }}
                            className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--ink-muted)]"
                          >
                            Отмена
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">
                          🏠 {g.name}{' '}
                          <span className="text-xs font-normal text-[var(--ink-muted)]">
                            (id {g.id})
                          </span>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={groupId === g.id || loading}
                            onClick={() => selectCluster(g.id)}
                            className="rounded-full border-2 border-[var(--ink)] bg-[var(--court-deep)] px-3 py-1.5 text-xs font-black text-[var(--cream)] shadow-[2px_2px_0_var(--ink)] transition disabled:opacity-50"
                          >
                            {groupId === g.id ? '✓ Активен' : 'Выбрать'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(g.id)
                              setEditGroupName(g.name)
                            }}
                            className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeGroup(g.id)}
                            className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {groups.length === 0 && (
                <p className="text-sm text-[var(--ink-muted)]">
                  Кластеров нет — создайте первый.
                </p>
              )}
            </section>
          )}

          {tab === 'players' && groupId != null && (
            <>
              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Добавить игрока 👤
                </h2>
                {groupId != null && currentGroupName && (
                  <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/20 px-3 py-2 text-sm font-bold text-[var(--ink)]">
                    Игрок попадёт в кластер{' '}
                    <span className="text-[var(--clay)]">{currentGroupName}</span>{' '}
                    <span className="font-mono text-xs font-normal text-[var(--ink-muted)]">
                      (group_id {groupId})
                    </span>
                  </p>
                )}
                <form onSubmit={addPlayer} className="space-y-4">
                  <label className="block text-sm font-bold">
                    Имя
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      placeholder="Например, Маша «Бэкхенд»"
                    />
                  </label>
                  <div>
                    <p className="text-sm font-bold">Аватар (emoji)</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPicker((s) => !s)}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] text-2xl shadow-[2px_2px_0_var(--ink)]"
                      >
                        {newEmoji}
                      </button>
                      <span className="text-xs text-[var(--ink-muted)]">
                        Нажми, чтобы открыть палитру
                      </span>
                    </div>
                    {showPicker && (
                      <div className="relative z-20 mt-3 overflow-hidden rounded-xl border-2 border-[var(--ink)]">
                        <EmojiPicker
                          onEmojiClick={(emojiData) => {
                            setNewEmoji(emojiData.emoji)
                            setShowPicker(false)
                          }}
                          theme={Theme.DARK}
                          width="100%"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] py-2.5 font-black text-[var(--cream)] shadow-[3px_3px_0_var(--ink)]"
                  >
                    Добавить игрока
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Список игроков 📋
                </h2>
                <div className="overflow-x-auto rounded-xl border-2 border-[var(--ink)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--surface-2)]">
                      <tr>
                        <th className="px-3 py-2 font-black">Emoji</th>
                        <th className="px-3 py-2 font-black">Имя</th>
                        <th className="px-3 py-2 font-black" />
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p) => (
                        <tr key={p.id} className="border-t border-[var(--ink)]">
                          {editingPlayerId === p.id ? (
                            <>
                              <td className="px-3 py-2 align-top" colSpan={3}>
                                <form
                                  onSubmit={(e) => void savePlayerEdit(e)}
                                  className="flex flex-col gap-3 py-1"
                                >
                                  <div className="flex flex-wrap items-end gap-3">
                                    <label className="min-w-[140px] flex-1 text-sm font-bold">
                                      Имя
                                      <input
                                        value={editPlayerName}
                                        onChange={(e) =>
                                          setEditPlayerName(e.target.value)
                                        }
                                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                                      />
                                    </label>
                                    <div>
                                      <p className="text-sm font-bold">Emoji</p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setShowEditPlayerPicker((s) => !s)
                                        }
                                        className="mt-1 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] text-2xl shadow-[2px_2px_0_var(--ink)]"
                                      >
                                        {editPlayerEmoji}
                                      </button>
                                    </div>
                                  </div>
                                  {showEditPlayerPicker && (
                                    <div className="relative z-20 overflow-hidden rounded-xl border-2 border-[var(--ink)]">
                                      <EmojiPicker
                                        onEmojiClick={(emojiData) => {
                                          setEditPlayerEmoji(emojiData.emoji)
                                          setShowEditPlayerPicker(false)
                                        }}
                                        theme={Theme.DARK}
                                        width="100%"
                                      />
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                                    >
                                      Сохранить
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPlayerId(null)
                                        setShowEditPlayerPicker(false)
                                      }}
                                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </form>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-xl">
                                {p.avatar_emoji}
                              </td>
                              <td className="px-3 py-2 font-semibold">{p.name}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPlayerId(p.id)
                                      setEditPlayerName(p.name)
                                      setEditPlayerEmoji(p.avatar_emoji)
                                      setShowEditPlayerPicker(false)
                                    }}
                                    className="rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--ink)]"
                                  >
                                    Изменить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void removePlayer(p.id)}
                                    className="rounded-lg border border-[var(--clay)] bg-[var(--clay-soft)] px-2 py-1 text-xs font-bold text-[var(--ink)]"
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {players.length === 0 && (
                    <p className="p-6 text-center text-[var(--ink-muted)]">
                      В этом кластере пока нет игроков
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {tab === 'players' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}

          {tab === 'tournaments' && groupId != null && (
            <>
              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Турниры группы 📋
                </h2>
                {tournaments.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    Пока нет турниров — создайте ниже.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tournaments.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
                      >
                        {editingTournamentId === t.id ? (
                          <form
                            onSubmit={(e) => void saveTournamentEdit(e)}
                            className="space-y-3 py-1"
                          >
                            <p className="text-xs text-[var(--ink-muted)]">
                              Формат и тип участников заданы при создании и здесь не
                              меняются (от них зависит сетка в БД).
                            </p>
                            <label className="block text-sm font-bold">
                              Название
                              <input
                                value={editTourName}
                                onChange={(e) => setEditTourName(e.target.value)}
                                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                              />
                            </label>
                            <label className="block text-sm font-bold">
                              Описание
                              <textarea
                                value={editTourDesc}
                                onChange={(e) => setEditTourDesc(e.target.value)}
                                rows={2}
                                className="mt-1 w-full resize-none rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                              />
                            </label>
                            <label className="block text-sm font-bold">
                              Дата
                              <input
                                type="date"
                                value={editTourDate}
                                onChange={(e) => setEditTourDate(e.target.value)}
                                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                              />
                            </label>
                            <label className="block text-sm font-bold">
                              Статус на сайте
                              <select
                                value={editTourStatus}
                                onChange={(e) =>
                                  setEditTourStatus(
                                    e.target.value === 'archived'
                                      ? 'archived'
                                      : 'active'
                                  )
                                }
                                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                              >
                                <option value="active">Активен</option>
                                <option value="archived">Архив</option>
                              </select>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                              >
                                Сохранить
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTournamentId(null)}
                                className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
                              >
                                Отмена
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-[var(--ink)]">{t.name}</p>
                              <p className="text-xs text-[var(--ink-muted)]">
                                {t.format} · {t.status} · id {t.id}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTournamentId(t.id)
                                  setEditTourName(t.name)
                                  setEditTourDesc(t.description ?? '')
                                  setEditTourDate(
                                    t.scheduled_date?.slice(0, 10) ??
                                      new Date().toISOString().slice(0, 10)
                                  )
                                  setEditTourStatus(
                                    t.status === 'archived' ? 'archived' : 'active'
                                  )
                                }}
                                className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-black text-[var(--ink)]"
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeTournament(t.id)}
                                className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1.5 text-xs font-black text-[var(--ink)]"
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Создать турнир 🏆
                </h2>
                {groupId != null && currentGroupName && (
                  <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/20 px-3 py-2 text-sm font-bold text-[var(--ink)]">
                    Турнир будет создан в кластере{' '}
                    <span className="text-[var(--clay)]">{currentGroupName}</span>{' '}
                    <span className="font-mono text-xs font-normal text-[var(--ink-muted)]">
                      (group_id {groupId})
                    </span>
                  </p>
                )}
                <form onSubmit={createTournament} className="space-y-3">
                  <label className="block text-sm font-bold">
                    Название
                    <input
                      value={tName}
                      onChange={(e) => setTName(e.target.value)}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Описание
                    <textarea
                      value={tDesc}
                      onChange={(e) => setTDesc(e.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Дата
                    <input
                      type="date"
                      value={tDate}
                      onChange={(e) => setTDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Формат
                    <select
                      value={tFormat}
                      onChange={(e) => {
                        setTFormat(e.target.value)
                        setSelectedPlayerIds([])
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="round_robin">Круговая (round_robin)</option>
                      <option value="playoff">Плей-офф (playoff)</option>
                      <option value="mixed">Круг + плей-офф (mixed)</option>
                    </select>
                  </label>

                  <label className="block text-sm font-bold">
                    Тип участников
                    <select
                      value={tPart}
                      onChange={(e) => {
                        const next =
                          e.target.value === 'double' ? 'double' : 'single'
                        setTPart(next)
                        if (tFormat === 'playoff') setSelectedPlayerIds([])
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="single">Одиночный (single)</option>
                      <option value="double">Пары (double)</option>
                    </select>
                    {tFormat === 'playoff' && (
                      <p className="mt-1 text-xs font-semibold text-[var(--clay)]">
                        Парный плей-офф: выберите тип «Пары» — создаётся пустая сетка;
                        состав матчей задаётся позже во вкладке «Матчи» или на странице
                        турнира.
                      </p>
                    )}
                  </label>

                  {tFormat === 'playoff' && (
                    <label className="block text-sm font-bold">
                      Количество участников (сетка)
                      <select
                        value={playoffSize}
                        onChange={(e) => {
                          const v = Number(e.target.value) as 4 | 8 | 16
                          setPlayoffSize(v)
                          setSelectedPlayerIds([])
                        }}
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value={4}>4 (1/2 + финал)</option>
                        <option value={8}>8 (1/4 + 1/2 + финал)</option>
                        <option value={16}>16 (1/16 + 1/4 + 1/2 + финал)</option>
                      </select>
                    </label>
                  )}

                  {tFormat === 'mixed' && (
                    <label className="block text-sm font-bold">
                      Сколько выходят в плей-офф
                      <select
                        value={mixedAdvancers}
                        onChange={(e) =>
                          setMixedAdvancers(Number(e.target.value) as 2 | 4)
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value={2}>2 (финал)</option>
                        <option value={4}>4 (1/2 + финал)</option>
                      </select>
                    </label>
                  )}

                  {(tFormat === 'playoff' || tFormat === 'mixed') && (
                    <div>
                      <p className="text-sm font-bold">
                        Участники
                        {tFormat === 'playoff' && (
                          <span className="font-normal text-[var(--ink-muted)]">
                            {' '}
                            — порядок = посев{' '}
                            {tPart === 'double'
                              ? '(по два клика на пару)'
                              : '(1-й клик = 1-й сеяный)'}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {tFormat === 'playoff'
                          ? tPart === 'double'
                            ? `Необязательно: можно не выбирать никого — сетка создаётся пустой, пары назначаются в матчах. Либо выберите ${playoffSize} пар (${playoffSize * 2} игроков) для ограничения состава турнира.`
                            : `Нужно ровно ${playoffSize} игроков.`
                          : 'Любое число ≥ 2; круг — все со всеми.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {players.map((p) => {
                          const on = selectedPlayerIds.includes(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleParticipant(p.id)}
                              className={`rounded-full border-2 border-[var(--ink)] px-3 py-1.5 text-xs font-bold transition ${
                                on
                                  ? 'bg-[var(--lime)] text-[var(--ink)]'
                                  : 'bg-[var(--surface-2)] text-[var(--ink-muted)]'
                              }`}
                            >
                              {p.avatar_emoji} {p.name}
                            </button>
                          )
                        })}
                      </div>
                      {selectedPlayerIds.length > 0 && (
                        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm font-semibold">
                          {selectedPlayerIds.map((id, idx) => {
                            const p = players.find((x) => x.id === id)
                            return (
                              <li
                                key={`${id}-${idx}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span>
                                  {p?.avatar_emoji} {p?.name}
                                </span>
                                <span className="flex gap-1">
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--ink)] px-1 text-xs"
                                    onClick={() => moveSeed(idx, -1)}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--ink)] px-1 text-xs"
                                    onClick={() => moveSeed(idx, 1)}
                                  >
                                    ↓
                                  </button>
                                </span>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
                  >
                    Создать турнир
                  </button>
                </form>
              </section>
            </>
          )}

          {tab === 'tournaments' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}

          {tab === 'matches' && groupId != null && (
            <>
              <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--lime)]/25 p-4 text-sm font-semibold text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]">
                <p className="font-black">Как устроена вкладка «Матчи»</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-muted)]">
                  <li>
                    <strong className="text-[var(--ink)]">Плей-офф: назначить состав</strong>{' '}
                    — для турниров формата <strong>плей-офф</strong> (одиночки или
                    пары). Выбираете ячейку сетки и участников. На публичной странице
                    то же делается в модалке матча.
                  </li>
                  <li>
                    <strong className="text-[var(--ink)]">Круг / лишний матч</strong>{' '}
                    — таблица ниже: <strong>изменить участников</strong> или{' '}
                    <strong>удалить строку</strong>. Удалить ячейку плей-оффа можно
                    только если на неё <em>не ссылаются</em> следующие раунды; иначе —
                    кнопка «Очистить состав» в блоке плей-оффа или удаление всего
                    турнира.
                  </li>
                  <li>
                    <strong className="text-[var(--ink)]">Добавить матч</strong> —{' '}
                    новая запись (круг, товарищеский). Для стандартного плей-оффа
                    обычно не нужна: ячейки сетки уже созданы вместе с турниром.
                  </li>
                </ul>
              </div>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Плей-офф: назначить участников в ячейку сетки 🎾
                </h2>
                <p className="mb-4 text-sm text-[var(--ink-muted)]">
                  Турниры с форматом «плей-офф». Для <strong>пар</strong> — четыре
                  поля; для <strong>одиночек</strong> — два (игрок A и B). Кнопка
                  «Очистить состав» убирает всех из ячейки (если матч ещё не
                  завершён). Счёт и статус при этом не трогаются.
                </p>
                <form
                  onSubmit={(e) => void assignPlayoffRoster(e)}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <label className="block text-sm font-bold sm:col-span-full">
                    Турнир (плей-офф)
                    <select
                      value={assignTournamentId}
                      onChange={(e) => {
                        const v =
                          e.target.value === '' ? '' : Number(e.target.value)
                        setAssignTournamentId(v)
                        setAssignMatchId('')
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">— выберите —</option>
                      {tournaments
                        .filter((x) => x.format === 'playoff')
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {isDoublesParticipantType(t.participant_type)
                              ? ' (пары)'
                              : ' (одиночки)'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm font-bold sm:col-span-full">
                    Матч сетки
                    <select
                      value={assignMatchId}
                      onChange={(e) =>
                        setAssignMatchId(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      disabled={assignTournamentId === ''}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 disabled:opacity-50"
                    >
                      <option value="">— выберите матч —</option>
                      {assignMatches.map((m) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} · {m.round ?? 'раунд'} · ячейка {m.bracket_order}
                          {m.status === 'completed' ? ' (завершён)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-bold">
                    {assignPlayoffDoubles ? 'Команда A — игрок 1' : 'Игрок A'}
                    <select
                      value={assignA}
                      onChange={(e) =>
                        setAssignA(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">—</option>
                      {assignRosterPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {assignPlayoffDoubles && (
                    <label className="block text-sm font-bold">
                      Команда A — игрок 2
                      <select
                        value={assignA2}
                        onChange={(e) =>
                          setAssignA2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value="">—</option>
                        {assignRosterPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm font-bold">
                    {assignPlayoffDoubles ? 'Команда B — игрок 1' : 'Игрок B'}
                    <select
                      value={assignB}
                      onChange={(e) =>
                        setAssignB(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">—</option>
                      {assignRosterPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {assignPlayoffDoubles && (
                    <label className="block text-sm font-bold">
                      Команда B — игрок 2
                      <select
                        value={assignB2}
                        onChange={(e) =>
                          setAssignB2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value="">—</option>
                        {assignRosterPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex flex-col gap-2 sm:col-span-full sm:flex-row">
                    <button
                      type="submit"
                      className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] sm:flex-1"
                    >
                      Сохранить состав матча
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearPlayoffCellRoster()}
                      className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] sm:w-auto sm:px-6"
                    >
                      Очистить состав
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Смешанный турнир: старт плей-офф 🥇
                </h2>
                <p className="mb-4 text-sm text-[var(--ink-muted)]">
                  Когда все матчи круга завершены, сформируйте сетку из топа по
                  таблице (2 или 4 участника — как задано при создании турнира).
                </p>
                <form
                  onSubmit={(e) => void generateMixedPlayoff(e)}
                  className="flex flex-wrap gap-3"
                >
                  <label className="block min-w-[200px] flex-1 text-sm font-bold">
                    Турнир (mixed)
                    <select
                      value={mixedPlayoffTournamentId}
                      onChange={(e) =>
                        setMixedPlayoffTournamentId(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">— выберите —</option>
                      {tournaments
                        .filter((x) => x.format === 'mixed')
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] px-5 py-2.5 font-black text-[var(--cream)] shadow-[3px_3px_0_var(--ink)]"
                    >
                      Сформировать плей-офф
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Добавить новый матч (не ячейка сетки) ⚡
                </h2>
                <p className="mb-4 text-sm text-[var(--ink-muted)]">
                  Создаётся <strong>дополнительная</strong> запись матча в БД — для
                  кругового турнира, круга в смешанном формате или особого случая.{' '}
                  <strong>Не заменяет</strong> назначение в плей-оффе: для ячеек сетки
                  используйте блок «Плей-офф: назначить участников» выше.
                  Списки игроков — из состава турнира (или всего кластера, если состав
                  не задан); при выборе турнира поля могут подставиться из посева.
                </p>
                {matchFormDoubles && (
                  <p className="mb-4 text-sm font-semibold text-[var(--ink-muted)]">
                    Парный турнир: укажите двоих на сторону «A» и двоих на сторону «B».
                  </p>
                )}
                <form
                  onSubmit={addMatch}
                  className={`grid gap-4 ${matchFormDoubles ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
                >
                  <label className="block text-sm font-bold sm:col-span-full">
                    Турнир
                    <select
                      value={matchTournamentId}
                      onChange={(e) => {
                        const v =
                          e.target.value === '' ? '' : Number(e.target.value)
                        setMatchTournamentId(v)
                        applyMatchDefaultsForTournament(v)
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">— выберите —</option>
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-bold">
                    {matchFormDoubles ? 'Команда A — игрок 1' : 'Игрок А'}
                    <select
                      value={matchA}
                      onChange={(e) =>
                        setMatchA(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">—</option>
                      {matchRosterPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {matchFormDoubles && (
                    <label className="block text-sm font-bold">
                      Команда A — игрок 2
                      <select
                        value={matchA2}
                        onChange={(e) =>
                          setMatchA2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value="">—</option>
                        {matchRosterPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm font-bold">
                    {matchFormDoubles ? 'Команда B — игрок 1' : 'Игрок Б'}
                    <select
                      value={matchB}
                      onChange={(e) =>
                        setMatchB(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="">—</option>
                      {matchRosterPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.avatar_emoji} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {matchFormDoubles && (
                    <label className="block text-sm font-bold">
                      Команда B — игрок 2
                      <select
                        value={matchB2}
                        onChange={(e) =>
                          setMatchB2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value="">—</option>
                        {matchRosterPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex items-end sm:col-span-full">
                    <button
                      type="submit"
                      className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
                    >
                      Добавить матч
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
                <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                  Круговые и добавленные вручную матчи ✏️
                </h2>
                <p className="mb-4 text-sm text-[var(--ink-muted)]">
                  Здесь только матчи <strong>круга</strong> (round_robin) и прочие
                  строки <strong>без</strong> связей «родитель — потомок» в сетке.
                  Выберите турнир — отредактируйте состав или удалите лишнее. Ячейки
                  плей-оффа, из которых выходят полуфинал/финал, система не даст
                  удалить; для них см. блок плей-оффа выше (очистка состава).
                </p>
                <label className="mb-4 block text-sm font-bold">
                  Турнир
                  <select
                    value={rrListTournamentId}
                    onChange={(e) => {
                      const v =
                        e.target.value === '' ? '' : Number(e.target.value)
                      setRrListTournamentId(v)
                    }}
                    className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                  >
                    <option value="">— выберите —</option>
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                {rrListTournamentId !== '' && rrMatches.length === 0 && (
                  <p className="text-sm text-[var(--ink-muted)]">
                    В этом турнире нет круговых / «плоских» матчей для списка (все
                    строки относятся к сетке плей-оффа). Меняйте их в блоке плей-оффа
                    или на странице турнира.
                  </p>
                )}

                {rrMatches.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border-2 border-[var(--ink)]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--surface-2)]">
                        <tr>
                          <th className="px-3 py-2 font-black">id</th>
                          <th className="px-3 py-2 font-black">Сторона A</th>
                          <th className="px-3 py-2 font-black">Сторона B</th>
                          <th className="px-3 py-2 font-black">Статус</th>
                          <th className="px-3 py-2 font-black" />
                        </tr>
                      </thead>
                      <tbody>
                        {rrMatches.map((m) => (
                          <tr key={m.id} className="border-t border-[var(--ink)]">
                            {editingRrMatchId === m.id ? (
                              <td className="px-3 py-3 align-top" colSpan={5}>
                                <form
                                  onSubmit={(e) => void saveRoundRobinMatchEdit(e)}
                                  className="grid gap-3 sm:grid-cols-2"
                                >
                                  <label className="block text-sm font-bold">
                                    {rrFormDoubles
                                      ? 'Команда A — игрок 1'
                                      : 'Игрок A'}
                                    <select
                                      value={editRrA}
                                      onChange={(e) =>
                                        setEditRrA(
                                          e.target.value === ''
                                            ? ''
                                            : Number(e.target.value)
                                        )
                                      }
                                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                                    >
                                      <option value="">—</option>
                                      {rrRosterPlayers.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.avatar_emoji} {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {rrFormDoubles && (
                                    <label className="block text-sm font-bold">
                                      Команда A — игрок 2
                                      <select
                                        value={editRrA2}
                                        onChange={(e) =>
                                          setEditRrA2(
                                            e.target.value === ''
                                              ? ''
                                              : Number(e.target.value)
                                          )
                                        }
                                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                                      >
                                        <option value="">—</option>
                                        {rrRosterPlayers.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.avatar_emoji} {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                  <label className="block text-sm font-bold">
                                    {rrFormDoubles
                                      ? 'Команда B — игрок 1'
                                      : 'Игрок B'}
                                    <select
                                      value={editRrB}
                                      onChange={(e) =>
                                        setEditRrB(
                                          e.target.value === ''
                                            ? ''
                                            : Number(e.target.value)
                                        )
                                      }
                                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                                    >
                                      <option value="">—</option>
                                      {rrRosterPlayers.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.avatar_emoji} {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {rrFormDoubles && (
                                    <label className="block text-sm font-bold">
                                      Команда B — игрок 2
                                      <select
                                        value={editRrB2}
                                        onChange={(e) =>
                                          setEditRrB2(
                                            e.target.value === ''
                                              ? ''
                                              : Number(e.target.value)
                                          )
                                        }
                                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                                      >
                                        <option value="">—</option>
                                        {rrRosterPlayers.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.avatar_emoji} {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                  <div className="flex flex-wrap gap-2 sm:col-span-full">
                                    <button
                                      type="submit"
                                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                                    >
                                      Сохранить
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRrMatchId('')
                                        setEditRrA('')
                                        setEditRrA2('')
                                        setEditRrB('')
                                        setEditRrB2('')
                                      }}
                                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </form>
                              </td>
                            ) : (
                              <>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {m.id}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-semibold">
                                    {playerLabel(m.player_a_id)}
                                  </div>
                                  {m.player_a2_id != null && (
                                    <div className="text-xs text-[var(--ink-muted)]">
                                      {playerLabel(m.player_a2_id)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-semibold">
                                    {playerLabel(m.player_b_id)}
                                  </div>
                                  {m.player_b2_id != null && (
                                    <div className="text-xs text-[var(--ink-muted)]">
                                      {playerLabel(m.player_b2_id)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {m.status}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRrMatchId(m.id)
                                        setEditRrA(m.player_a_id ?? '')
                                        setEditRrA2(m.player_a2_id ?? '')
                                        setEditRrB(m.player_b_id ?? '')
                                        setEditRrB2(m.player_b2_id ?? '')
                                      }}
                                      className="rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)] px-2 py-1 text-xs font-bold"
                                    >
                                      Изменить
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void deleteMatchAdmin(
                                          m.id,
                                          rrListTournamentId as number
                                        )
                                      }
                                      className="rounded-lg border border-[var(--clay)] bg-[var(--clay-soft)] px-2 py-1 text-xs font-bold"
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'matches' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
