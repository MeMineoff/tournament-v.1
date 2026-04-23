'use client'

import { usePathname } from 'next/navigation'
import type { Group } from '@/lib/types'
import type { ClusterSelection } from '@/lib/cluster'
import { Nav } from '@/components/Nav'

type Props = {
  groups: Group[]
  clusterSelection: ClusterSelection
}

export function NavShell({ groups, clusterSelection }: Props) {
  const pathname = usePathname()
  const hideClusterSelect = pathname === '/'

  return (
    <Nav
      groups={groups}
      clusterSelection={clusterSelection}
      hideClusterSelect={hideClusterSelect}
    />
  )
}
