import Link from 'next/link'

export default function NotFound() {
  return (
    <>
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-6xl">🎾❓</p>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-black text-[var(--ink)]">
          Турнир не найден
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Возможно, турнир в другом кластере или удалён.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-6 py-3 font-bold text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]"
        >
          На главную
        </Link>
      </div>
    </>
  )
}
