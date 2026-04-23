/** Распознавание парного турнира в UI (старые/альтернативные значения в БД). */
export function isDoublesParticipantType(raw: string): boolean {
  const p = raw.toLowerCase()
  return (
    p === 'double' ||
    p === 'doubles' ||
    p === 'pair' ||
    p === 'pairs' ||
    p === 'пары'
  )
}
