import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Unbounded, Onest } from 'next/font/google'
import { NavShell } from '@/components/NavShell'
import { supabase } from '@/lib/supabaseClient'
import type { Group } from '@/lib/types'
import { CLUSTER_COOKIE_NAME, parseClusterSelection } from '@/lib/cluster'
import './globals.css'

const display = Unbounded({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
})

const body = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'FUN Court — турниры',
  description: 'Турниры, матчи и FUN-рейтинг в спортивном зале',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [{ data: groupsRaw }, cookieStore] = await Promise.all([
    supabase.from('groups').select('*').order('id'),
    cookies(),
  ])
  const groups = (groupsRaw ?? []) as Group[]
  const clusterSelection = parseClusterSelection(
    groups,
    cookieStore.get(CLUSTER_COOKIE_NAME)?.value
  )

  return (
    <html
      lang="ru"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)] text-[var(--ink)]">
        <div className="noise-overlay pointer-events-none fixed inset-0 z-[5] opacity-[0.07] mix-blend-multiply" />
        <NavShell groups={groups} clusterSelection={clusterSelection} />
        {children}
      </body>
    </html>
  )
}
