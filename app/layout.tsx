import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { NavShell } from '@/components/NavShell'
import { getGroupsForNav } from '@/lib/cachedGroups'
import { CLUSTER_COOKIE_NAME, parseClusterSelection } from '@/lib/cluster'
import './font-face.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'FUN Arena — турниры',
  description: 'Турниры, матчи и FUN-рейтинг в спортивном зале',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [{ groups }, cookieStore] = await Promise.all([
    getGroupsForNav(),
    cookies(),
  ])
  const clusterSelection = parseClusterSelection(
    groups,
    cookieStore.get(CLUSTER_COOKIE_NAME)?.value
  )

  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-[family-name:var(--font-body)] text-[var(--ink)]"
        suppressHydrationWarning
      >
        <div className="noise-overlay pointer-events-none fixed inset-0 z-[5] opacity-[0.07] mix-blend-multiply" />
        <NavShell groups={groups} clusterSelection={clusterSelection} />
        {children}
      </body>
    </html>
  )
}
