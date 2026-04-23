import Link from 'next/link'
import type { Group } from '@/lib/types'
import type { ClusterSelection } from '@/lib/cluster'
import { GroupClusterSelect } from '@/components/GroupClusterSelect'

type Props = {
  groups?: Group[]
  clusterSelection?: ClusterSelection
  hideClusterSelect?: boolean
}

export function Nav({
  groups,
  clusterSelection,
  hideClusterSelect = false,
}: Props = {}) {
  const showCluster =
    !hideClusterSelect &&
    groups != null &&
    groups.length > 0 &&
    clusterSelection != null

  return (
    <header className="relative z-50 border-b-2 border-[var(--ink)] bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="group flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--ink)] transition-transform hover:-rotate-1"
          >
            <span className="text-2xl transition group-hover:scale-110">🎾</span>
            <span className="hidden sm:inline">FUN Court</span>
          </Link>
          {showCluster && (
            <div className="rounded-xl border-2 border-[var(--ink)] bg-[var(--court)] px-3 py-2 shadow-[2px_2px_0_var(--ink)] sm:ml-2">
              <GroupClusterSelect
                groups={groups}
                value={clusterSelection}
                variant="nav"
              />
            </div>
          )}
        </div>
        <nav className="flex items-center gap-2 text-sm font-semibold sm:gap-3">
          <Link
            href="/"
            className="rounded-full border-2 border-transparent px-3 py-1.5 text-[var(--ink-muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Турниры
          </Link>
          <Link
            href="/admin"
            className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1.5 text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
          >
            Админ 🛠️
          </Link>
        </nav>
      </div>
    </header>
  )
}
