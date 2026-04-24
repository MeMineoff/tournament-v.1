/**
 * Дата турнира для UI: один источник правды с сервера, чтобы избежать
 * расхождений Intl между Node и браузером при гидрации (React #418).
 */
export function formatDateRuLong(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(isoDate))
  } catch {
    return isoDate
  }
}
