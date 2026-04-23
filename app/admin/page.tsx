import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabaseClient'
import { getAdminServerInitial } from '@/lib/adminClusterInit'
import { CLUSTER_COOKIE_NAME } from '@/lib/cluster'
import { AdminView } from './AdminView'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const rawCluster = (await cookies()).get(CLUSTER_COOKIE_NAME)?.value
  const init = await getAdminServerInitial(supabase, rawCluster)
  return (
    <AdminView
      initialGroups={init.groups}
      initialGroupId={init.groupId}
      initialInitHint={init.initHint}
      initialDataLoadError={init.dataLoadError}
      shouldWriteCookieToGroupId={init.shouldWriteCookieToGroupId}
      initialPlayers={init.initialPlayers}
      initialTournaments={init.initialTournaments}
    />
  )
}
