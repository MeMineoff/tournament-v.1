/**
 * «Failed to fetch» в браузере — не баг RLS, а сеть/блокировка запроса к Supabase
 * (другой origin). Сервер (Vercel) при этом к базе часто ходит нормально.
 */
const HINT_RU = `
— Отключите VPN/прокси, попробуйте другой Wi‑Fi или мобильный интернет.
— Временно отключите AdBlock, Privacy Badger, «антивирус с проверкой HTTPS».
— Откройте в другом браузере (Chrome / Edge) или в обычном окне, не в приватном с блокировками.
— В Vercel: Settings → Environment Variables — заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY; после изменения сделан Redeploy.`

/**
 * Добавляет подсказку, если в тексте ошибки признаки сбоя fetch из браузера.
 */
export function appendBrowserSupabaseNetworkHint(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('err_network')
  ) {
    return message.trim() + HINT_RU
  }
  return message
}
