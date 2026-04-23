'use client'

import type { Group } from '@/lib/types'
import type { ClusterSelection } from '@/lib/cluster'
import { GroupClusterSelect } from '@/components/GroupClusterSelect'

type Props = {
  groups: Group[]
  value: ClusterSelection
}

export function HomeClusterCorner({ groups, value }: Props) {
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-30 sm:right-4 sm:top-4 md:right-6 md:top-6">
      <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--court)]/95 p-2.5 shadow-[4px_4px_0_var(--ink)] backdrop-blur-sm">
        <GroupClusterSelect groups={groups} value={value} variant="corner" />
      </div>
    </div>
  )
}
