'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import PublicHeader from '@/components/landing/PublicHeader'
import PublicFooter from '@/components/landing/PublicFooter'
import LandingHero from '@/components/landing/hero/LandingHero'
import CardSection from '@/components/landing/sections/CardSection'
import TurnSection from '@/components/landing/sections/TurnSection'
import HowItWorksSection from '@/components/landing/sections/HowItWorksSection'
import ExchangeSection from '@/components/landing/sections/ExchangeSection'
import EventWorkspaceSection from '@/components/landing/sections/EventWorkspaceSection'
import MobileSection from '@/components/landing/sections/MobileSection'
import PricingSection from '@/components/landing/sections/PricingSection'
import ComingNextSection from '@/components/landing/sections/ComingNextSection'
import TrustSection from '@/components/landing/sections/TrustSection'
import {
  CaptureSection,
  CrmSection,
  FollowUpSection,
  RememberSection,
} from '@/components/landing/sections/WorkflowSections'
import {
  AudienceSection,
  FaqSection,
  FinalCtaSection,
} from '@/components/landing/sections/ClosingSections'

/**
 * The public landing page.
 *
 * The order is the argument. The promise and the free card open it; the turn
 * hands over to the five steps ABC actually performs; each step then gets its
 * own chapter — capture, the meeting, the follow-up, the CRM, the event. After
 * that come the things a careful buyer checks: how it runs on a phone, what is
 * still to come, who it is for, what it costs, what ABC does with their data,
 * and the questions that stop people.
 *
 * Every capability named here exists in the release candidate
 * (berlin-final-release-cleanup). The one thing that does not — event
 * intelligence — is labelled as coming next and kept visually subordinate.
 *
 * A client component only because of the session check below. The metadata for
 * this route lives in app/page.tsx, which renders this.
 */
export default function LandingPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const [redirecting, setRedirecting] = useState(false)

  /*
    Signed-in visitors go to their dashboard.

    The page paints immediately and the redirect happens underneath it if a
    session turns up, rather than blanking the whole marketing site behind a
    spinner for every first-time visitor and crawler.
  */
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session) return
      setRedirecting(true)
      router.replace('/dashboard')
    })
    return () => {
      active = false
    }
  }, [router, supabase])

  return (
    <div className="pub-root" aria-busy={redirecting || undefined}>
      <PublicHeader />

      <main>
        <LandingHero />
        <CardSection />
        <TurnSection />
        <HowItWorksSection />
        <CaptureSection />
        <RememberSection />
        <FollowUpSection />
        <CrmSection />
        <EventWorkspaceSection />
        <ExchangeSection />
        <MobileSection />
        <ComingNextSection />
        <AudienceSection />
        <PricingSection />
        <TrustSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <PublicFooter />
    </div>
  )
}
