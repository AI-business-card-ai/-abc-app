'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/layout/AppHeader'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import MobileNav from '@/components/layout/MobileNav'
import { CLEARS_MOBILE_NAV, SAFE_LEFT, SAFE_RIGHT } from '@/lib/ui/layout'

/**
 * Public, signed-out surfaces: no app chrome, full width.
 *
 * Each of these renders its own complete page. Falling through to the
 * authenticated shell showed a visitor who had never signed in the product's
 * sidebar — Scan, Contacts, Follow-ups — wrapped around a legal page or a
 * marketing page, and stacked a second header on the ones that carry the
 * public header. `/account-deletion` belongs here for the same reason: the
 * stores link to it, it must work signed out, and it is a standalone page.
 */
const PUBLIC_PATHS = [
  '/',
  '/privacy',
  '/terms',
  '/account-deletion',
  '/pricing/success',
  '/pricing/cancel',
]

/** Auth and first-run screens: no app chrome, and a narrow centred column. */
const BARE_PATHS = [
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

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>

  if (BARE_PATHS.includes(pathname)) {
    return (
      <div className="flex min-h-screen justify-center bg-abc-bg">
        <div
          className={`relative min-h-screen w-full ${
            pathname === '/onboarding' ? 'max-w-[600px]' : 'max-w-[430px]'
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
        <main
          className="min-w-0 flex-1 lg:!pb-0"
          style={{ paddingBottom: CLEARS_MOBILE_NAV, paddingLeft: SAFE_LEFT, paddingRight: SAFE_RIGHT }}
        >
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
