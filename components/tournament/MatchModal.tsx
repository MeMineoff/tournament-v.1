'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Match, MatchEnriched, Player, Tournament } from '@/lib/types'
import { requestPatchMatch } from '@/lib/requestPatchMatch'
import { validateDoublesMatchRoster } from '@/lib/doublesRoster'
import { assertAllParticipantsInTournament } from '@/lib/participantGuards'
import {
  assertNoPlayoffSameRoundPlayerReuse,
  isPlayoffPlayerDisabledInSelect,
  playoffSameRoundBusyElsewhere,
} from '@/lib/playoffRosterConflict'
import { tournamentPlayers } from '@/lib/stats'
import { StarRow } from '@/components/tournament/StarRow'

const defaultAllowRoster =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ALLOW_MATCH_ROSTER_EDIT !== 'false'

type Props = {
  match: MatchEnriched | null
  open: boolean
  onClose: () => void
  tournament: Tournament
  players: Player[]
  doublesTournament: boolean
  /** Состав в модалке (роль тренера). Выключите: NEXT_PUBLIC_ALLOW_MATCH_ROSTER_EDIT=false */
  canAssignRoster?: boolean
  /** Счёт и статус меняются только в админке. Для публичной страницы — false. */
  canEditScore?: boolean
  /** Матчи турнира — для антидубля в плей-офф при назначении состава. */
  tournamentMatches?: Match[]
}

export function MatchModal({
  match,
  open,
  onClose,
  doublesTournament,
  tournament,
  players,
  canAssignRoster = defaultAllowRoster,
  canEditScore = false,
  tournamentMatches,
}: Props) {
  const router = useRouter()
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [funA, setFunA] = useState<number | null>(null)
  const [funB, setFunB] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [matchCompleted, setMatchCompleted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rosterSaving, setRosterSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [roA, setRoA] = useState<number | ''>('')
  const [roA2, setRoA2] = useState<number | ''>('')
  const [roB, setRoB] = useState<number | ''>('')
  const [roB2, setRoB2] = useState<number | ''>('')

  const rosterScope = useMemo(
    () => tournamentPlayers(tournament, players),
    [tournament, players]
  )

  const playoffBusyElsewhere = useMemo(() => {
    if (tournament.format !== 'playoff' || !match || !tournamentMatches?.length) {
      return new Set<number>()
    }
    return playoffSameRoundBusyElsewhere(tournament, match, tournamentMatches)
  }, [tournament, match, tournamentMatches])

  function slotTaken(
    optionId: number,
    current: number | '',
    others: Array<number | ''>
  ): boolean {
    if (current !== '' && Number(current) === optionId) return false
    return others.some((v) => v !== '' && Number(v) === optionId)
  }

  useEffect(() => {
    if (!match) return
    setScoreA(match.score_a)
    setScoreB(match.score_b)
    setFunA(match.fun_rating_a)
    setFunB(match.fun_rating_b)
    setComment(match.comment ?? '')
    setMatchCompleted(match.status === 'completed')
    setRoA(match.player_a_id ?? '')
    setRoA2(match.player_a2_id ?? '')
    setRoB(match.player_b_id ?? '')
    setRoB2(match.player_b2_id ?? '')
    setErr(null)
  }, [match])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, handleKey])

  const hasFullDoublesRoster =
    match != null &&
    match.player_a_id != null &&
    match.player_a2_id != null &&
    match.player_b_id != null &&
    match.player_b2_id != null

  const showDoublesRosterEditor =
    doublesTournament &&
    canAssignRoster &&
    match != null &&
    match.status !== 'completed'

  const showSinglesRosterEditor =
    !doublesTournament &&
    canAssignRoster &&
    match != null &&
    match.status !== 'completed'

  async function saveRoster() {
    if (!match) return
    if (doublesTournament) {
      if (roA === '' || roA2 === '' || roB === '' || roB2 === '') {
        setErr('Выберите по двое игроков на каждую сторону.')
        return
      }
      const v = validateDoublesMatchRoster(
        Number(roA),
        Number(roA2),
        Number(roB),
        Number(roB2)
      )
      if (v) {
        setErr(v)
        return
      }
      const perr = assertAllParticipantsInTournament(
        [Number(roA), Number(roA2), Number(roB), Number(roB2)],
        tournament.participant_ids
      )
      if (perr) {
        setErr(perr)
        return
      }
      if (tournamentMatches && tournamentMatches.length > 0) {
        const clash = assertNoPlayoffSameRoundPlayerReuse(
          tournament,
          match,
          [Number(roA), Number(roA2), Number(roB), Number(roB2)],
          tournamentMatches
        )
        if (clash) {
          setErr(clash)
          return
        }
      }
    } else {
      if (roA === '' || roB === '') {
        setErr('Выберите игрока A и игрока B.')
        return
      }
      if (roA === roB) {
        setErr('Игроки A и B должны быть разными.')
        return
      }
      const perr = assertAllParticipantsInTournament(
        [Number(roA), Number(roB)],
        tournament.participant_ids
      )
      if (perr) {
        setErr(perr)
        return
      }
      if (tournamentMatches && tournamentMatches.length > 0) {
        const clash = assertNoPlayoffSameRoundPlayerReuse(
          tournament,
          match,
          [Number(roA), Number(roB)],
          tournamentMatches
        )
        if (clash) {
          setErr(clash)
          return
        }
      }
    }
    setRosterSaving(true)
    setErr(null)
    const patch = doublesTournament
      ? {
          player_a_id: Number(roA),
          player_a2_id: Number(roA2),
          player_b_id: Number(roB),
          player_b2_id: Number(roB2),
        }
      : {
          player_a_id: Number(roA),
          player_a2_id: null,
          player_b_id: Number(roB),
          player_b2_id: null,
        }
    const rosterRes = await requestPatchMatch({
      id: match.id,
      tournamentId: tournament.id,
      patch,
    })
    setRosterSaving(false)
    if (!rosterRes.ok) {
      setErr([rosterRes.error, rosterRes.hint].filter(Boolean).join(' · '))
      return
    }
    router.refresh()
    onClose()
  }

  async function save() {
    if (!match) return
    const canRateFun = doublesTournament
      ? hasFullDoublesRoster
      : match.player_a_id != null && match.player_b_id != null
    if (!canRateFun) {
      setErr('Сначала должны быть назначены оба участника (обе команды).')
      return
    }
    setSaving(true)
    setErr(null)
    const payload = canEditScore
      ? {
          score_a: scoreA,
          score_b: scoreB,
          fun_rating_a: funA,
          fun_rating_b: funB,
          comment: comment.slice(0, 140) || null,
          status: matchCompleted ? 'completed' : 'scheduled',
        }
      : {
          fun_rating_a: funA,
          fun_rating_b: funB,
        }
    const saveRes = await requestPatchMatch({
      id: match.id,
      tournamentId: tournament.id,
      patch: payload,
    })

    setSaving(false)
    if (!saveRes.ok) {
      setErr([saveRes.error, saveRes.hint].filter(Boolean).join(' · '))
      return
    }
    router.refresh()
    onClose()
  }

  const canSaveScores =
    match != null &&
    (doublesTournament
      ? hasFullDoublesRoster
      : match.player_a_id != null && match.player_b_id != null)
  const canSaveFun = canSaveScores

  const sideAUnassigned =
    match &&
    (doublesTournament
      ? match.player_a_id == null && match.player_a2_id == null
      : match.player_a_id == null)
  const sideBUnassigned =
    match &&
    (doublesTournament
      ? match.player_b_id == null && match.player_b2_id == null
      : match.player_b_id == null)

  return (
    <AnimatePresence>
      {open && match && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ink)]/55 backdrop-blur-[2px]"
            aria-label="Закрыть"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-modal-title"
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border-4 border-[var(--ink)] bg-[var(--surface)] shadow-[8px_8px_0_var(--ink)]"
            initial={{ y: 40, opacity: 0, rotate: -1 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <div className="border-b-4 border-[var(--ink)] bg-[var(--lime)] px-5 py-4">
              <p
                id="match-modal-title"
                className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink)]"
              >
                Матч ⚡
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]/80">
                {canEditScore
                  ? doublesTournament
                    ? 'Пары, счёт и FUN'
                    : 'Счёт и FUN — всё сохранится в облаке'
                  : 'FUN могут ставить все, счёт меняется только в админке'}
              </p>
            </div>

            <div className="space-y-5 p-5">
              {doublesTournament && !hasFullDoublesRoster && (
                <p className="rounded-xl border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-sm font-bold text-[var(--ink)]">
                  {sideAUnassigned && sideBUnassigned
                    ? 'Команды не назначены — укажите состав ниже (или дождитесь перехода победителей из сетки).'
                    : 'Состав неполный — назначьте все четыре позиции или дождитесь сетки.'}
                </p>
              )}

              {showSinglesRosterEditor && (
                <div className="space-y-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/50 p-4">
                  <p className="text-sm font-black text-[var(--ink)]">
                    Назначение игроков
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Только игроки из состава турнира (participant_ids).
                  </p>
                  {tournament.format === 'playoff' && playoffBusyElsewhere.size > 0 && (
                    <p className="text-xs font-semibold text-[var(--ink)]">
                      Уже задействованы в другом матче этого тура сетки — в списке
                      неактивны.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold">
                      Игрок A
                      <select
                        value={roA}
                        onChange={(e) =>
                          setRoA(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roA, [roB]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roA,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      Игрок B
                      <select
                        value={roB}
                        onChange={(e) =>
                          setRoB(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roB, [roA]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roB,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={rosterSaving}
                    onClick={() => void saveRoster()}
                    className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2 text-sm font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] disabled:opacity-60"
                  >
                    {rosterSaving ? 'Сохраняю состав…' : 'Сохранить состав ✓'}
                  </button>
                </div>
              )}

              {showDoublesRosterEditor && (
                <div className="space-y-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/50 p-4">
                  <p className="text-sm font-black text-[var(--ink)]">
                    Назначение команд (тренер)
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Только игроки из состава турнира (participant_ids).
                  </p>
                  {tournament.format === 'playoff' && playoffBusyElsewhere.size > 0 && (
                    <p className="text-xs font-semibold text-[var(--ink)]">
                      Уже задействованы в другом матче этого тура сетки — в списке
                      неактивны.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold">
                      Команда A — игрок 1
                      <select
                        value={roA}
                        onChange={(e) =>
                          setRoA(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roA, [roA2, roB, roB2]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roA,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      Команда A — игрок 2
                      <select
                        value={roA2}
                        onChange={(e) =>
                          setRoA2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roA2, [roA, roB, roB2]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roA2,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      Команда B — игрок 1
                      <select
                        value={roB}
                        onChange={(e) =>
                          setRoB(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roB, [roA, roA2, roB2]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roB,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      Команда B — игрок 2
                      <select
                        value={roB2}
                        onChange={(e) =>
                          setRoB2(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {rosterScope.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={
                              slotTaken(p.id, roB2, [roA, roA2, roB]) ||
                              isPlayoffPlayerDisabledInSelect(
                                playoffBusyElsewhere,
                                roB2,
                                p.id
                              )
                            }
                          >
                            {p.avatar_emoji} {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={rosterSaving}
                    onClick={() => void saveRoster()}
                    className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2 text-sm font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] disabled:opacity-60"
                  >
                    {rosterSaving ? 'Сохраняю состав…' : 'Сохранить состав ✓'}
                  </button>
                </div>
              )}

              {err && (
                <p
                  className="rounded-lg border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
                  role="alert"
                >
                  {err}
                </p>
              )}

              {!doublesTournament && !canSaveScores && !showSinglesRosterEditor && (
                <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 text-sm font-bold text-[var(--ink-muted)]">
                  ⏳ Один или оба слота пусты — победители подставятся из предыдущих
                  матчей сетки (или назначьте состав выше).
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                <div className="flex min-w-[120px] flex-1 flex-col items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{match.player_a_emoji}</span>
                    <span className="font-bold leading-tight">
                      {sideAUnassigned
                        ? doublesTournament
                          ? 'Команда не назначена'
                          : 'Не назначено'
                        : match.player_a_name}
                    </span>
                  </div>
                  {(doublesTournament || match.player_a2_name) &&
                    !sideAUnassigned && (
                      <div className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2">
                        <span className="text-3xl">{match.player_a2_emoji}</span>
                        <span className="font-bold leading-tight">
                          {match.player_a2_name || '—'}
                        </span>
                      </div>
                    )}
                </div>
                <span className="font-[family-name:var(--font-display)] text-2xl font-black text-[var(--clay)]">
                  vs
                </span>
                <div className="flex min-w-[120px] flex-1 flex-col items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{match.player_b_emoji}</span>
                    <span className="font-bold leading-tight">
                      {sideBUnassigned
                        ? doublesTournament
                          ? 'Команда не назначена'
                          : 'Не назначено'
                        : match.player_b_name}
                    </span>
                  </div>
                  {(doublesTournament || match.player_b2_name) &&
                    !sideBUnassigned && (
                      <div className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2">
                        <span className="text-3xl">{match.player_b2_emoji}</span>
                        <span className="font-bold leading-tight">
                          {match.player_b2_name || '—'}
                        </span>
                      </div>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-[var(--ink-muted)]">
                    Счёт А
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={scoreA}
                    disabled={!canEditScore || !canSaveScores}
                    onChange={(e) => setScoreA(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 font-mono text-lg font-bold text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--clay)] disabled:opacity-50"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-[var(--ink-muted)]">
                    Счёт Б
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={scoreB}
                    disabled={!canEditScore || !canSaveScores}
                    onChange={(e) => setScoreB(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 font-mono text-lg font-bold text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--clay)] disabled:opacity-50"
                  />
                </label>
              </div>

              <StarRow
                label={
                  doublesTournament
                    ? 'FUN команды A (1–5)'
                    : 'FUN для игрока А (1–5)'
                }
                value={funA}
                onChange={setFunA}
                accent="var(--lime)"
                disabled={!canSaveFun}
              />
              <StarRow
                label={
                  doublesTournament
                    ? 'FUN команды B (1–5)'
                    : 'FUN для игрока Б (1–5)'
                }
                value={funB}
                onChange={setFunB}
                accent="var(--clay-soft)"
                disabled={!canSaveFun}
              />

              {!canEditScore && (
                <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 text-xs font-bold text-[var(--ink-muted)]">
                  Счёт меняется только в админке турнира.
                </p>
              )}

              {canEditScore && (
                <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/35 px-3 py-3 shadow-[2px_2px_0_var(--ink)]">
                <input
                  id="match-completed"
                  type="checkbox"
                  checked={matchCompleted}
                  disabled={!canSaveScores}
                  onChange={(e) => setMatchCompleted(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-2 border-[var(--ink)] accent-[var(--lime)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-50"
                />
                <label
                  htmlFor="match-completed"
                  className="cursor-pointer text-sm font-black leading-snug text-[var(--ink)]"
                >
                  Завершить матч
                  <span className="mt-0.5 block text-xs font-semibold text-[var(--ink-muted)]">
                    Пока не отмечено — статус останется «запланирован», даже со счётом
                    и оценками.
                  </span>
                </label>
                </div>
              )}

              {canEditScore && (
                <label className="block space-y-1">
                <span className="text-xs font-bold uppercase text-[var(--ink-muted)]">
                  Комментарий ({comment.length}/140)
                </span>
                <textarea
                  maxLength={140}
                  value={comment}
                  disabled={!canSaveScores}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--clay)] disabled:opacity-50"
                  placeholder="Зал, настроение, эйсы, смех…"
                />
                </label>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-bold text-[var(--ink)] transition hover:bg-[var(--cream)]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={saving || (canEditScore ? !canSaveScores : !canSaveFun)}
                  onClick={() => void save()}
                  className="flex-1 rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] px-4 py-2.5 text-sm font-bold text-[var(--cream)] shadow-[4px_4px_0_var(--ink)] transition enabled:hover:translate-x-0.5 enabled:hover:translate-y-0.5 enabled:hover:shadow-none disabled:opacity-60"
                >
                  {saving ? 'Сохраняю…' : canEditScore ? 'Сохранить счёт ✓' : 'Сохранить FUN ★'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
