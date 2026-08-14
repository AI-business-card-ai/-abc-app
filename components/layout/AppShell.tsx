'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/layout/AppHeader'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import MobileNav from '@/components/layout/MobileNav'

/** Routes that render without any app chrome. */
const BARE_PATHS = ['/', '/login', '/register', '/onboarding', '/offline']

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
        <main className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
