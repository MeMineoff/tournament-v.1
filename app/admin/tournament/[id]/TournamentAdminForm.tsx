'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Match, Player, Tournament } from '@/lib/types'
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
}

export function TournamentAdminForm({
  tournament: initialTournament,
  groupPlayers,
  initialMatches,
}: Props) {
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament>(() => ({
    ...initialTournament,
    participant_ids: normalizeParticipantIds(
      initialTournament.participant_ids as unknown
    ),
  }))
  const [matches, setMatches] = useState(initialMatches)
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

  const doubles = isDoublesParticipantType(tournament.participant_type)
  const participantIdsOrdered = useMemo(
    () => normalizeParticipantIds(tournament.participant_ids) ?? [],
    [tournament.participant_ids]
  )

  const playerById = useMemo(() => {
    const m = new Map<number, Player>()
    for (const p of groupPlayers) m.set(Number(p.id), p)
    return m
  }, [groupPlayers])

  /** Состав турнира в том же порядке, что и при создании (participant_ids). */
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
    setFScoreA(Number(m.score_a ?? 0))
    setFScoreB(Number(m.score_b ?? 0))
    setFCompleted(m.status === 'completed')
  }

  async function refreshAll() {
    const [{ data: tr }, { data: mr }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournament.id).single(),
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('round_index', { ascending: true })
        .order('bracket_order', { ascending: true }),
    ])
    if (tr) {
      const row = tr as Tournament & { participant_ids?: unknown }
      setTournament({
        ...row,
        participant_ids: normalizeParticipantIds(row.participant_ids),
      } as Tournament)
    }
    if (mr) setMatches(mr as Match[])
    router.refresh()
  }

  async function updateParticipantIds(next: number[]) {
    setSavingPid(true)
    setMsg(null)
    const { error } = await supabase
      .from('tournaments')
      .update({ participant_ids: next })
      .eq('id', tournament.id)
    setSavingPid(false)
    if (error) {
      setMsg(error.message)
      return
    }
    await refreshAll()
    setMsg('Состав турнира обновлён ✅')
  }

  async function addParticipant(playerId: number) {
    const cur = normalizeParticipantIds(tournament.participant_ids) ?? []
    if (cur.some((id) => Number(id) === Number(playerId))) return
    const next = [...cur, Number(playerId)]
    await updateParticipantIds(next)
  }

  async function removeParticipant(playerId: number) {
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
    const pids = normalizeParticipantIds(tournament.participant_ids)
    const curMatch = matches.find((m) => m.id === fillMatchId)
    if (!curMatch) {
      setRosterFormErr('Матч не найден в списке — обновите страницу.')
      return
    }
    if (doubles) {
      if (fA === '' || fA2 === '' || fB === '' || fB2 === '') {
        setRosterFormErr('Укажите четырёх игроков.')
        return
      }
      const v = validateDoublesMatchRoster(Number(fA), Number(fA2), Number(fB), Number(fB2))
      if (v) {
        setRosterFormErr(v)
        return
      }
      const err = assertAllParticipantsInTournament(
        [Number(fA), Number(fA2), Number(fB), Number(fB2)],
        pids
      )
      if (err) {
        setRosterFormErr(err)
        return
      }
      const clash = assertNoPlayoffSameRoundPlayerReuse(
        tournament,
        curMatch,
        [Number(fA), Number(fA2), Number(fB), Number(fB2)],
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
          player_a2_id: Number(fA2),
          player_b_id: Number(fB),
          player_b2_id: Number(fB2),
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
    if (tournament.format !== 'round_robin') return
    const pids = normalizeParticipantIds(tournament.participant_ids)
    if (doubles) {
      if (addA === '' || addA2 === '' || addB === '' || addB2 === '') {
        setMsg('Укажите четырёх игроков.')
        return
      }
      const v = validateDoublesMatchRoster(
        Number(addA),
        Number(addA2),
        Number(addB),
        Number(addB2)
      )
      if (v) {
        setMsg(v)
        return
      }
      const err = assertAllParticipantsInTournament(
        [Number(addA), Number(addA2), Number(addB), Number(addB2)],
        pids
      )
      if (err) {
        setMsg(err)
        return
      }
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

    const { data: boRows, error: boErr } = await supabase
      .from('matches')
      .select('bracket_order')
      .eq('tournament_id', tournament.id)
    if (boErr) {
      setMsg(boErr.message)
      return
    }
    const maxBo = Math.max(
      0,
      ...(boRows ?? []).map((r) => Number((r as { bracket_order?: number }).bracket_order ?? 0))
    )

    const row = doubles
      ? {
          tournament_id: tournament.id,
          player_a_id: Number(addA),
          player_a2_id: Number(addA2),
          player_b_id: Number(addB),
          player_b2_id: Number(addB2),
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

    const { error } = await supabase.from('matches').insert(row)
    if (error) {
      setMsg(error.message)
      return
    }
    setAddA('')
    setAddA2('')
    setAddB('')
    setAddB2('')
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
          Участники турнира
        </h2>
        <p className="mb-4 rounded-lg border border-[var(--ink)]/20 bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
          Пул участников ведётся здесь. В матчах можно выбирать только людей из списка «В составе
          турнира».
        </p>
        {rosterIdMismatch && (
          <p className="mb-4 rounded-lg border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-xs font-bold text-[var(--ink)]">
            В базе в составе турнира указано id больше, чем удалось сопоставить с игроками
            кластера ({tournamentRosterPlayers.length} из {participantIdsOrdered.length}).
            Проверьте, что турнир привязан к нужному кластеру и игроки не удалялись.
          </p>
        )}
        {savingPid && (
          <p className="mb-2 text-sm font-semibold text-[var(--ink-muted)]">Сохранение состава…</p>
        )}
        <div className="mb-6">
          <p className="mb-2 text-sm font-bold">
            В составе турнира ({tournamentRosterPlayers.length})
            {participantIdsOrdered.length > 0 && (
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
                  <button
                    type="button"
                    onClick={() => void removeParticipant(Number(p.id))}
                    disabled={savingPid}
                    className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
      </section>

      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Матчи турнира
        </h2>

        {tournament.format === 'round_robin' && (
          <div className="mb-8 space-y-4">
            <h3 className="text-lg font-black">Добавить матч (круг)</h3>
            <form onSubmit={(e) => void addRoundRobinMatch(e)} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">
                {doubles ? 'Команда A — игрок 1' : 'Игрок A'}
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
                      disabled={optionTaken(Number(p.id), addA, [addA2, addB, addB2])}
                    >
                      {p.avatar_emoji} {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {doubles && (
                <label className="text-sm font-bold">
                  Команда A — игрок 2
                  <select
                    value={addA2}
                    onChange={(e) =>
                      setAddA2(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                  >
                    <option value="">—</option>
                    {rosterPlayers.map((p) => (
                      <option
                        key={p.id}
                        value={String(p.id)}
                        disabled={optionTaken(Number(p.id), addA2, [addA, addB, addB2])}
                      >
                        {p.avatar_emoji} {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm font-bold">
                {doubles ? 'Команда B — игрок 1' : 'Игрок B'}
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
                      disabled={optionTaken(Number(p.id), addB, [addA, addA2, addB2])}
                    >
                      {p.avatar_emoji} {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {doubles && (
                <label className="text-sm font-bold">
                  Команда B — игрок 2
                  <select
                    value={addB2}
                    onChange={(e) =>
                      setAddB2(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                  >
                    <option value="">—</option>
                    {rosterPlayers.map((p) => (
                      <option
                        key={p.id}
                        value={String(p.id)}
                        disabled={optionTaken(Number(p.id), addB2, [addA, addA2, addB])}
                      >
                        {p.avatar_emoji} {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="sm:col-span-full">
                <button
                  type="submit"
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
                      {m.player_a_id ?? '—'} vs {m.player_b_id ?? '—'}
                      {doubles && ` (+ партнёры)`}
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
              Пустые ячейки сетки можно заполнить или переназначить. В списках выбора —
              только игроки из блока «В составе» выше. Для сетки 4 в парах логично иметь
              минимум 8 человек в составе (4 пары), но можно и больше — лишние остаются в
              резерве.
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
              <label className="text-xs font-bold">
                {doubles ? 'A — игрок 1' : 'Игрок A'}
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
                        optionTaken(Number(p.id), fA, [fA2, fB, fB2]) ||
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
              {doubles && (
                <label className="text-xs font-bold">
                  A — игрок 2
                  <select
                    value={fA2 === '' ? '' : String(fA2)}
                    onChange={(e) =>
                      setFA2(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                  >
                    <option value="">—</option>
                    {rosterPlayers.map((p) => (
                      <option
                        key={p.id}
                        value={String(p.id)}
                        disabled={
                          optionTaken(Number(p.id), fA2, [fA, fB, fB2]) ||
                          isPlayoffPlayerDisabledInSelect(
                            playoffBusyElsewhere,
                            fA2,
                            Number(p.id)
                          )
                        }
                      >
                        {p.avatar_emoji} {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-bold">
                {doubles ? 'B — игрок 1' : 'Игрок B'}
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
                        optionTaken(Number(p.id), fB, [fA, fA2, fB2]) ||
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
              {doubles && (
                <label className="text-xs font-bold">
                  B — игрок 2
                  <select
                    value={fB2 === '' ? '' : String(fB2)}
                    onChange={(e) =>
                      setFB2(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="mt-1 w-full cursor-pointer rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2"
                  >
                    <option value="">—</option>
                    {rosterPlayers.map((p) => (
                      <option
                        key={p.id}
                        value={String(p.id)}
                        disabled={
                          optionTaken(Number(p.id), fB2, [fA, fA2, fB]) ||
                          isPlayoffPlayerDisabledInSelect(
                            playoffBusyElsewhere,
                            fB2,
                            Number(p.id)
                          )
                        }
                      >
                        {p.avatar_emoji} {p.name}
                      </option>
                    ))}
                  </select>
                </label>
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
