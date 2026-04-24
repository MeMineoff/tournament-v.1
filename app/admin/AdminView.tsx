'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Group, Player, Tournament } from '@/lib/types'
import {
  CLUSTER_COOKIE_MAX_AGE,
  CLUSTER_COOKIE_NAME,
  CLUSTER_COOKIE_VALUE_ALL,
  parseClusterSelection,
} from '@/lib/cluster'
import { deleteGroupCascade } from '@/lib/adminDelete'
import { appendBrowserSupabaseNetworkHint } from '@/lib/supabaseNetworkHint'
import { AdminClustersPanel } from './AdminClustersPanel'
import {
  groupClusterReducer,
  initialGroupCluster,
  initialPlayerList,
  initialTournamentCreate,
  initialTournamentListEdit,
  playerListReducer,
  tournamentCreateReducer,
  tournamentListEditReducer,
} from './adminViewState'
import { TournamentBasicForm } from './TournamentBasicForm'
import { TournamentMatchesPanel } from './TournamentMatchesPanel'
import { TournamentPlayersList } from './TournamentPlayersList'
import { TournamentTeamsManager } from './TournamentTeamsManager'

export type AdminViewProps = {
  initialGroups: Group[]
  initialGroupId: number | null
  initialInitHint: string | null
  initialDataLoadError: string | null
  shouldWriteCookieToGroupId: number | null
  initialPlayers: Player[]
  initialTournaments: Tournament[]
}

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
  return appendBrowserSupabaseNetworkHint(parts.join('\n'))
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
  if (err instanceof Error) {
    return appendBrowserSupabaseNetworkHint(err.message)
  }
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
  const [dataLoadError, setDataLoadError] = useState<string | null>(initialDataLoadError)
  const [initHint, setInitHint] = useState<string | null>(initialInitHint)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<AdminTab>('clusters')

  const [create, dispatchCreate] = useReducer(
    tournamentCreateReducer,
    initialTournamentCreate
  )
  const [g, dispatchG] = useReducer(groupClusterReducer, initialGroupCluster)
  const [p, dispatchP] = useReducer(playerListReducer, initialPlayerList)
  const [te, dispatchTe] = useReducer(
    tournamentListEditReducer,
    initialTournamentListEdit
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
    if (shouldWriteCookieToGroupId == null || cookieSyncedRef.current) {
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
    if (!g.newGroupName.trim()) {
      setMsg('Введите название группы')
      return
    }
    const { error } = await supabase.from('groups').insert({ name: g.newGroupName.trim() })
    if (error) {
      setMsg(error.message)
      return
    }
    dispatchG({ type: 'resetNewGroup' })
    const { data: gdata } = await supabase.from('groups').select('*').order('id')
    const list = (gdata ?? []) as Group[]
    setGroups(list)
    setMsg('Группа создана ✅')
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (groupId == null) return
    if (!p.newName.trim()) {
      setMsg('Введите имя игрока')
      return
    }
    const { error } = await supabase.from('players').insert({
      group_id: groupId,
      name: p.newName.trim(),
      avatar_emoji: p.newEmoji || '🎾',
    })
    if (error) {
      setMsg(error.message)
      return
    }
    dispatchP({ type: 'afterPlayerAdd' })
    setMsg('Игрок добавлен ✅')
    void loadGroupData()
  }

  async function createTournament(e: React.FormEvent) {
    e.preventDefault()
    if (create.creatingTournament) return
    setMsg(null)
    if (createTournamentBlockedReason) {
      setMsg(createTournamentBlockedReason)
      return
    }
    dispatchCreate({ type: 'setCreating', value: true })
    setMsg('⏳ Создаём турнир…')
    try {
      const res = await fetch('/api/admin/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          name: create.tName.trim(),
          description: create.tDesc.trim() || null,
          scheduledDate: create.tDate,
          format: create.tFormat,
          participantType: create.tPart,
          playoffBracketSize: create.tFormat === 'playoff' ? create.playoffSize : undefined,
        }),
      })

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; tournament: Tournament; matchCount?: number }
        | { ok: false; error?: string }
        | null

      if (!res.ok || !payload || payload.ok !== true) {
        const errText =
          payload && 'error' in payload && payload.error
            ? payload.error
            : `HTTP ${res.status}`
        setMsg(appendBrowserSupabaseNetworkHint(errText))
        return
      }

      const tid = Number(payload.tournament.id)
      const matchNote =
        create.tFormat === 'playoff' ? ` · матчей в БД: ${payload.matchCount ?? 0}` : ''
      setTournaments((prev) => [payload.tournament, ...prev])
      dispatchCreate({ type: 'resetAfterCreate' })
      setMsg(`Турнир создан 🏆${matchNote} Состав и матчи: /admin/tournament/${tid}`)
      router.refresh()
    } catch (err: unknown) {
      console.error('[admin createTournament API]', err)
      setMsg(formatUnknownSupabaseErr(err))
    } finally {
      dispatchCreate({ type: 'setCreating', value: false })
    }
  }

  async function saveGroupEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (g.editingGroupId == null || !g.editGroupName.trim()) {
      setMsg('Введите название кластера.')
      return
    }
    const { error } = await supabase
      .from('groups')
      .update({ name: g.editGroupName.trim() })
      .eq('id', g.editingGroupId)
    if (error) {
      setMsg(error.message)
      return
    }
    const { data: gdata } = await supabase.from('groups').select('*').order('id')
    setGroups((gdata ?? []) as Group[])
    dispatchG({ type: 'cancelEdit' })
    setMsg('Кластер обновлён ✅')
  }

  async function savePlayerEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (p.editingPlayerId == null || !p.editPlayerName.trim()) {
      setMsg('Введите имя игрока.')
      return
    }
    const { error } = await supabase
      .from('players')
      .update({
        name: p.editPlayerName.trim(),
        avatar_emoji: p.editPlayerEmoji || '🎾',
      })
      .eq('id', p.editingPlayerId)
    if (error) {
      setMsg(error.message)
      return
    }
    dispatchP({ type: 'cancelPlayerEdit' })
    setMsg('Игрок обновлён ✅')
    void loadGroupData()
  }

  async function saveTournamentEdit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (te.editingTournamentId == null || !te.editTourName.trim()) {
      setMsg('Введите название турнира.')
      return
    }
    const { error } = await supabase
      .from('tournaments')
      .update({
        name: te.editTourName.trim(),
        description: te.editTourDesc.trim() || null,
        scheduled_date: te.editTourDate,
        status: te.editTourStatus,
      })
      .eq('id', te.editingTournamentId)
    if (error) {
      setMsg(error.message)
      return
    }
    dispatchTe({ type: 'closeEdit' })
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
    if (!confirm('Удалить турнир и все его матчи? Действие необратимо.')) return
    setMsg(null)
    let payload: { ok?: boolean; error?: string } | null = null
    try {
      const res = await fetch('/api/admin/tournaments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      payload = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null
      if (!res.ok || !payload || payload.ok !== true) {
        setMsg(
          appendBrowserSupabaseNetworkHint(
            payload?.error ?? `Удаление не выполнено (HTTP ${res.status}).`
          )
        )
        return
      }
    } catch (e: unknown) {
      setMsg(formatUnknownSupabaseErr(e))
      return
    }
    if (te.editingTournamentId === id) {
      dispatchTe({ type: 'closeEdit' })
    }
    setTournaments((prev) => prev.filter((t) => t.id !== id))
    setMsg('Турнир удалён')
    router.refresh()
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
    const { data: gdata } = await supabase.from('groups').select('*').order('id')
    const list = (gdata ?? []) as Group[]
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

  const currentGroupName: string | null =
    groupId != null ? (groups.find((gr) => gr.id === groupId)?.name ?? null) : null

  const navClusterSel =
    groups.length > 0 ? parseClusterSelection(groups, readClusterCookie()) : 'all'

  const createTournamentBlockedReason = useMemo(() => {
    if (groupId == null) return 'Сначала выберите кластер во вкладке «Кластеры».'
    if (!create.tName.trim()) return 'Введите название турнира.'
    return null
  }, [groupId, create.tName])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)] sm:text-4xl">
          Админ-панель 🛠️
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Схема{' '}
          <code className="rounded bg-[var(--surface-2)] px-1">tournament</code>
          · на главной при «все кластеры» в админке по умолчанию берётся <strong>первый</strong> кластер
          в списке; если списки пустые, а на сайте данные есть — откройте <strong>«Кластеры»</strong> и
          нажмите <strong>«Выбрать»</strong> у нужного зала (это совпадает с переключателем кластера в
          шапке сайта).
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
                На сайте в шапке выбрано <strong>«Общее — все кластеры»</strong> (или кластер ещё
                не зафиксирован). Чтобы создать турнир или игрока, откройте вкладку{' '}
                <strong>«Кластеры»</strong> и нажмите <strong>«Выбрать»</strong> у нужной группы — новые
                сущности попадут только туда.
              </>
            ) : (
              <>Выберите кластер во вкладке «Кластеры», чтобы загрузить игроки и турниры.</>
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
              Частая причина: в Supabase для таблиц в схеме{' '}
              <code className="rounded bg-[var(--cream)] px-1">tournament</code> выключен доступ на
              чтение для роли
              <code className="rounded bg-[var(--cream)] px-1">anon</code> (см. Table Editor → RLS /
              политики).
            </p>
          </div>
        )}
        {initHint && !dataLoadError && (
          <div className="mt-3 rounded-2xl border-2 border-[var(--ink)] bg-[var(--lime)]/40 px-4 py-3 text-sm font-semibold text-[var(--ink)]">
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
                <strong>из всех залов сразу</strong>. <strong>Здесь в админке</strong> список относится{' '}
                <strong>только к одному кластеру</strong> — сейчас открыт «{currentGroupName}». Если
                здесь пусто, а на сайте везде куча имён, откройте вкладку <strong>«Кластеры»</strong> и
                нажмите <strong>«Выбрать»</strong> у того зала, куда вы всё вносили.
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
              В этой группе пока нет игроков и турниров. Добавьте их ниже или проверьте, что открыли
              ту же базу, что и на главной.
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
          {ADMIN_TABS.map((tt) => (
            <button
              key={tt.id}
              type="button"
              onClick={() => setTab(tt.id)}
              className={`whitespace-nowrap rounded-xl border-2 border-[var(--ink)] px-3 py-2.5 text-left text-sm font-black transition lg:w-full ${
                tab === tt.id
                  ? 'bg-[var(--lime)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]'
                  : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <span className="mr-1.5">{tt.emoji}</span>
              {tt.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-8">
          {tab === 'clusters' && (
            <AdminClustersPanel
              groups={groups}
              groupId={groupId}
              navClusterSel={navClusterSel}
              g={g}
              dispatchG={dispatchG}
              createGroup={createGroup}
              selectCluster={selectCluster}
              saveGroupEdit={saveGroupEdit}
              removeGroup={removeGroup}
            />
          )}

          {tab === 'players' && groupId != null && (
            <TournamentPlayersList
              groupId={groupId}
              currentGroupName={currentGroupName}
              players={players}
              p={p}
              dispatchP={dispatchP}
              addPlayer={addPlayer}
              savePlayerEdit={savePlayerEdit}
              removePlayer={removePlayer}
            />
          )}

          {tab === 'players' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}

          {tab === 'tournaments' && groupId != null && (
            <>
              <TournamentTeamsManager
                tournaments={tournaments}
                te={te}
                dispatchTe={dispatchTe}
                saveTournamentEdit={saveTournamentEdit}
                removeTournament={removeTournament}
              />

              {te.editingTournamentId == null ? (
                <TournamentBasicForm
                  create={create}
                  dispatchCreate={dispatchCreate}
                  createTournament={createTournament}
                  createTournamentBlockedReason={createTournamentBlockedReason}
                  groupId={groupId}
                  currentGroupName={currentGroupName}
                />
              ) : (
                <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                  Сейчас открыт режим редактирования турнира — блок «Создать турнир» скрыт, чтобы не
                  путаться.
                </p>
              )}
            </>
          )}

          {tab === 'tournaments' && groupId == null && (
            <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
              Сначала выберите кластер во вкладке «Кластеры».
            </p>
          )}

          {tab === 'matches' && groupId != null && <TournamentMatchesPanel tournaments={tournaments} />}

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
