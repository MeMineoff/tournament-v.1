/**
 * Supabase/PostgREST в Node 18+ (undici) на нестабильных сетях часто даёт
 * `TypeError: terminated`, ECONNRESET и т.п. — повтор уменьшает «пустую» страницу.
 * В браузере — те же всплески (VPN, Wi‑Fi).
 */
const RETRIABLE_MESSAGE =
  /terminated|econnreset|etimedout|enotfound|getaddrinfo|fetch failed|network|econnrefused|socket|aborted|reset|timeout/i

function wait(ms: number) {
  return new Promise((r) => {
    setTimeout(r, ms)
  })
}

/**
 * Один инстанс на приложение: то же поведение в Supabase client и в ручных fetch.
 */
let defaultInstance: typeof fetch | null = null
export function getFetchWithRetry(): typeof fetch {
  if (!defaultInstance) defaultInstance = createFetchWithRetry(4, 200)
  return defaultInstance
}

export function createFetchWithRetry(
  maxAttempts: number = 4,
  baseDelayMs: number = 200
): typeof fetch {
  return async (input, init) => {
    let last: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(input, init)
        if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
          await wait(baseDelayMs * attempt * attempt)
          continue
        }
        return res
      } catch (e) {
        last = e
        const msg = e instanceof Error ? e.message : String(e)
        if (attempt < maxAttempts && RETRIABLE_MESSAGE.test(msg)) {
          await wait(baseDelayMs * attempt * attempt)
          continue
        }
        throw e
      }
    }
    throw last
  }
}
