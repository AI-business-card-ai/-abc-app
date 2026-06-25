'use client'

import { usePathname } from 'next/navigation'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import BottomNav from '@/components/ui/BottomNav'

const AUTH_PATHS = ['/login', '/register', '/', '/onboarding']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthShell = AUTH_PATHS.includes(pathname)
  const isLanding = pathname === '/'

  if (isAuthShell) {
    return (
      <div className="min-h-screen flex justify-center" style={{ background: '#0d0f1a' }}>
        <div
          className={`w-full min-h-screen relative ${
            isLanding
              ? ''
              : pathname === '/onboarding'
                ? 'max-w-[600px]'
                : 'max-w-[430px]'
          }`}
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#0d0f1a' }}>
      <div className="hidden lg:block shrink-0 w-[220px]" aria-hidden>
        <DesktopSidebar />
      </div>

      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        {children}
      </main>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <BottomNav />
      </div>
    </div>
  )
}
