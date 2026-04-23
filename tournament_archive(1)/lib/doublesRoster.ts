/** Проверка перед сохранением состава 2×2 в парном матче. */
export function validateDoublesMatchRoster(
  a: number,
  a2: number,
  b: number,
  b2: number
): string | null {
  const ids = [a, a2, b, b2]
  if (ids.some((x) => !Number.isFinite(x) || x <= 0)) {
    return 'Укажите всех четырёх игроков.'
  }
  if (new Set(ids).size !== 4) {
    return 'Все четыре игрока должны быть разными.'
  }
  return null
}
