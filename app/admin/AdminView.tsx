'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Theme } from 'emoji-picker-react'
import { supabase } from '@/lib/supabaseClient'
import type { Group, Player, Tournament } from '@/lib/types'
import { buildPlayoffBracketSkeleton, tierSizesForBracket } from '@/lib/bracket'
import { insertBracketInTiers } from '@/lib/bracketInsert'
import {
  CLUSTER_COOKIE_MAX_AGE,
  CLUSTER_COOKIE_NAME,
  CLUSTER_COOKIE_VALUE_ALL,
  parseClusterSelection,
} from '@/lib/cluster'
import { deleteGroupCascade, deleteTournamentCascade } from '@/lib/adminDelete'

export type AdminViewProps = {
  initialGroups: Group[]
  initialGroupId: number | null
  initialInitHint: string | null
  initialDataLoadError: string | null
  shouldWriteCookieToGroupId: number | null
  initialPlayers: Player[]
  initialTournaments: Tournament[]
}

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

export function AdminView({
  initialGroups,
  initialGroupId,
  initialInitHint,
  initialDataLoadError,
  shouldWriteCookieToGroupId,
  initialPlayers,
  initialTournaments,
}: AdminViewProps) {
  const router = useRouter()
  const cookieSyncedRef = useRef(false)
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [groupId, setGroupId] = useState<number | null>(initialGroupId)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments)
  const [loading, setLoading] = useState(false)
  const [dataLoadError, setDataLoadError] = useState<string | null>(
    initialDataLoadError
  )
  const [initHint, setInitHint] = useState<string | null>(initialInitHint)
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
  const [creatingTournament, setCreatingTournament] = useState(false)
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

  const loadGroupData = useCallback(async () => {
    if (groupId == null) return
    setLoading(true)
    setDataLoadError(null)
    try {
      const [rPlayers, rTournaments] = await Promise.all([
        supabase.from('players').select('*').eq('group_id', groupId).order('name'),
        supabase
          .from('tournaments')
          .select('*')
          .eq('group_id', groupId)
          .order('scheduled_date', { ascending: false }),
      ])
      const err = rPlayers.error ?? rTournaments.error
      if (err) {
        setDataLoadError(formatSupabaseError(err))
        setPlayers([])
        setTournaments([])
      } else {
        setPlayers((rPlayers.data ?? []) as Player[])
        setTournaments((rTournaments.data ?? []) as Tournament[])
        setDataLoadError(null)
      }
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    if (
      shouldWriteCookieToGroupId == null ||
      cookieSyncedRef.current
    ) {
      return
    }
    cookieSyncedRef.current = true
    writeClusterCookie(shouldWriteCookieToGroupId)
    router.refresh()
  }, [shouldWriteCookieToGroupId, router])

  useEffect(() => {
    if (groupId == null) {
      setPlayers([])
      setTournaments([])
      setLoading(false)
      return
    }
    void loadGroupData()
  }, [groupId, loadGroupData])

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

  async function createTournament(e: React.FormEvent) {
    e.preventDefault()
    if (creatingTournament) return
    setMsg(null)
    if (createTournamentBlockedReason) {
      setMsg(createTournamentBlockedReason)
      return
    }
    setCreatingTournament(true)
    setMsg('⏳ Создаём турнир (запрос к базе)…')
    let tid: number | null = null

    try {
      const playoff_bracket_size = tFormat === 'playoff' ? playoffSize : null
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
        participant_ids: null,
      }

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

      tid = created!.id as number

      if (tFormat === 'playoff') {
        setMsg('⏳ Создаём сетку плей-офф (несколько шагов в БД)…')
        const { rows, parentLinks } = buildPlayoffBracketSkeleton(
          tid,
          playoffSize,
          participant_type
        )
        await insertBracketInTiers(
          rows,
          parentLinks,
          tierSizesForBracket(playoffSize)
        )
      }

      setTName('')
      setTDesc('')

      let matchNote = ''
      if (tFormat === 'playoff' && tid != null) {
        const { count, error: cErr } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tid)
        if (!cErr && count != null) {
          matchNote = ` · матчей в БД: ${count}`
        }
      }
      setMsg(
        `Турнир создан 🏆${matchNote} Состав и матчи: /admin/tournament/${tid}`
      )
      void loadGroupData().catch((e) => {
        console.error('[admin] loadGroupData после создания турнира', e)
        setMsg((m) =>
          m
            ? `${m}\n\nСписок турниров не обновился — обновите страницу.`
            : 'Список не обновился — обновите страницу.'
        )
      })
    } catch (err: unknown) {
      console.error('[admin createTournament] этап матчей / сетки', err)
      const detail = formatUnknownSupabaseErr(err)
      if (tid != null) {
        const rollbackErr = await deleteTournamentCascade(supabase, tid)
        setMsg(
          `${detail}${
            rollbackErr
              ? `\n\nНе удалось убрать черновик турнира из БД: ${rollbackErr} (id ${tid}).`
              : `\n\nЧерновик турнира удалён. Проверьте миграции matches (doubles-колонки, participant_type).`
          }`
        )
      } else {
        setMsg(detail)
      }
      void loadGroupData()
    } finally {
      setCreatingTournament(false)
    }
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

  const createTournamentBlockedReason = useMemo(() => {
    if (groupId == null) return 'Сначала выберите кластер во вкладке «Кластеры».'
    if (!tName.trim()) return 'Введите название турнира.'
    return null
  }, [groupId, tName])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)] sm:text-4xl">
          Админ-панель 🛠️
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Схема{' '}
          <code className="rounded bg-[var(--surface-2)] px-1">tournament</code>
          · на главной при «все кластеры» в админке по умолчанию берётся{' '}
          <strong>первый</strong> кластер в списке; если списки пустые, а на сайте данные
          есть — откройте <strong>«Кластеры»</strong> и нажмите <strong>«Выбрать»</strong> у
          нужного зала (это совпадает с переключателем кластера в шапке сайта).
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
        {dataLoadError && (
          <div
            className="mt-3 rounded-xl border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-4 py-3 text-sm font-semibold whitespace-pre-wrap text-[var(--ink)]"
            role="alert"
          >
            <span className="font-black">Не удалось загрузить данные.</span> {dataLoadError}
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Частая причина: в Supabase для таблиц в схеме <code className="rounded bg-[var(--cream)] px-1">tournament</code> выключен доступ на чтение для роли
              <code className="rounded bg-[var(--cream)] px-1">anon</code> (см. Table Editor → RLS / политики).
            </p>
          </div>
        )}
        {initHint && !dataLoadError && (
          <div className="mt-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/40 px-4 py-3 text-sm font-semibold text-[var(--ink)]">
            {initHint}
          </div>
        )}
        {!loading &&
          !dataLoadError &&
          groupId != null &&
          players.length === 0 &&
          tournaments.length === 0 &&
          groups.length > 1 && (
            <div className="mt-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/90 px-4 py-3 text-sm font-semibold text-[var(--ink)]">
              <p>
                <strong>На главной</strong> при режиме «все кластеры» вы видите данные{' '}
                <strong>из всех залов сразу</strong>. <strong>Здесь в админке</strong> список
                относится <strong>только к одному кластеру</strong> — сейчас открыт «
                {currentGroupName}». Если здесь пусто, а на сайте везде куча имён, откройте
                вкладку <strong>«Кластеры»</strong> и нажмите <strong>«Выбрать»</strong> у того
                зала, куда вы всё вносили.
              </p>
            </div>
          )}
        {!loading &&
          !dataLoadError &&
          groupId != null &&
          players.length === 0 &&
          tournaments.length === 0 &&
          groups.length === 1 && (
            <div className="mt-3 rounded-xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
              В этой группе пока нет игроков и турниров. Добавьте их ниже или проверьте, что
              открыли ту же базу, что и на главной.
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
                            disabled={groupId === g.id}
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
                              <Link
                                href={`/admin/tournament/${t.id}`}
                                className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                              >
                                Участники и матчи
                              </Link>
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

              {editingTournamentId == null ? (
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
                  <p className="rounded-lg border-2 border-[var(--ink)]/20 bg-[var(--lime)]/15 px-3 py-2 text-sm font-black text-[var(--ink)]">
                    Шаг 1 · Основная информация
                  </p>
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
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="round_robin">Круговая (round_robin)</option>
                      <option value="playoff">Плей-офф (playoff)</option>
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
                      }}
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="single">Одиночный (single)</option>
                      <option value="double">Пары (double)</option>
                    </select>
                  </label>

                  {tFormat === 'playoff' && (
                    <label className="block text-sm font-bold">
                      Размер сетки плей-офф
                      <select
                        value={playoffSize}
                        onChange={(e) => {
                          const v = Number(e.target.value) as 4 | 8 | 16
                          setPlayoffSize(v)
                        }}
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                      >
                        <option value={4}>4 (1/2 + финал)</option>
                        <option value={8}>8 (1/4 + 1/2 + финал)</option>
                        <option value={16}>16 (1/16 + 1/4 + 1/2 + финал)</option>
                      </select>
                    </label>
                  )}

                  <p className="text-xs text-[var(--ink-muted)]">
                    Участников и матчи добавляйте на странице редактирования турнира.
                    Для плей-оффа здесь создаётся пустая сетка.
                  </p>
                  {createTournamentBlockedReason && (
                    <p className="text-xs font-bold text-[var(--clay)]">
                      {createTournamentBlockedReason}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={creatingTournament || createTournamentBlockedReason != null}
                    className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingTournament ? 'Создаём...' : 'Создать турнир'}
                  </button>
                </form>
                </section>
              ) : (
                <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                  Сейчас открыт режим редактирования турнира — блок «Создать турнир» скрыт, чтобы
                  не путаться.
                </p>
              )}
            </>
          )}

          {tab === 'tournaments' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}

          {tab === 'matches' && groupId != null && (
            <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
              <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
                Матчи и состав турниров ⚡
              </h2>
              <p className="mb-4 text-sm text-[var(--ink-muted)]">
                Назначение игроков на матчи, добавление матчей круга и правка{' '}
                <code className="rounded bg-[var(--cream)] px-1">participant_ids</code>{' '}
                перенесены на страницу турнира. Откройте нужный турнир:
              </p>
              {tournaments.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Турниров пока нет.</p>
              ) : (
                <ul className="space-y-2">
                  {tournaments.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
                    >
                      <div>
                        <span className="font-bold">{t.name}</span>
                        <span className="ml-2 text-xs text-[var(--ink-muted)]">
                          {t.format} · id {t.id}
                        </span>
                      </div>
                      <Link
                        href={`/admin/tournament/${t.id}`}
                        className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                      >
                        Редактировать матчи →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
