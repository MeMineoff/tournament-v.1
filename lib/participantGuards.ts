import { normalizeParticipantIds } from '@/lib/participantIds'

/** Проверка, что все id входят в состав турнира. */
export function assertAllParticipantsInTournament(
  playerIds: (number | null | undefined)[],
  participantIds: number[] | null | undefined
): string | null {
  const ids = playerIds.filter(
    (x): x is number => x != null && Number.isFinite(Number(x))
  )
  const allowedList = normalizeParticipantIds(participantIds)
  if (!allowedList?.length) {
    return 'Состав турнира пуст — добавьте участников на странице редактирования турнира.'
  }
  const allowed = new Set(allowedList)
  for (const id of ids) {
    if (!allowed.has(Number(id))) {
      return 'Все игроки матча должны входить в состав турнира (participant_ids).'
    }
  }
  return null
}
