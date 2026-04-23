/** Renders a Supabase/PostgREST/undici error for the UI (includes nested cause, e.g. ENOTFOUND). */
export function supabaseErrorMessage(err: { message: string; cause?: unknown }): string {
  const c = err.cause
  if (c instanceof Error) {
    return `${err.message} (${c.message})`
  }
  if (c != null) {
    return `${err.message} (${String(c)})`
  }
  return err.message
}
