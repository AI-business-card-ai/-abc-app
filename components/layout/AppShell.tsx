'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/layout/AppHeader'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import MobileNav from '@/components/layout/MobileNav'
import { CLEARS_MOBILE_NAV } from '@/lib/ui/layout'

/** Routes that render without any app chrome. */
const BARE_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/offline',
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isPublicCard =
    pathname.startsWith('/d/') || pathname.startsWith('/u/') || pathname.startsWith('/card/')

  if (isPublicCard) return <>{children}</>

  if (BARE_PATHS.includes(pathname)) {
    const isLanding = pathname === '/'
    return (
      <div className="flex min-h-screen justify-center bg-abc-bg">
        <div
          className={`relative min-h-screen w-full ${
            isLanding ? '' : pathname === '/onboarding' ? 'max-w-[600px]' : 'max-w-[430px]'
          }`}
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-abc-bg">
      <div className="hidden w-[260px] shrink-0 lg:block" aria-hidden="true">
        <DesktopSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="min-w-0 flex-1 lg:!pb-0" style={{ paddingBottom: CLEARS_MOBILE_NAV }}>
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
