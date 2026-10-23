'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import PublicHeader from '@/components/landing/PublicHeader'
import PublicFooter from '@/components/landing/PublicFooter'
import LandingHero from '@/components/landing/hero/LandingHero'
import ProblemSection from '@/components/landing/sections/ProblemSection'
import CaptureContextSection from '@/components/landing/sections/CaptureContextSection'
import RoiSection from '@/components/landing/sections/RoiSection'
import EventWorkspaceSection from '@/components/landing/sections/EventWorkspaceSection'
import LifecycleSection from '@/components/landing/sections/LifecycleSection'
import EventIntelligenceSection from '@/components/landing/sections/EventIntelligenceSection'
import CardSection from '@/components/landing/sections/CardSection'
import TrustSection from '@/components/landing/sections/TrustSection'
import PricingSection from '@/components/landing/sections/PricingSection'
import { CrmSection, FollowUpSection } from '@/components/landing/sections/WorkflowSections'
import { FinalCtaSection } from '@/components/landing/sections/ClosingSections'

/**
 * The public landing page — one sales story, in eight scenes.
 *
 * The order is the argument, and it is a funnel rather than a feature list:
 *
 *   1  Hero            the promise: handshake to CRM
 *   2  Problem         the meeting happened, the CRM knows nothing
 *   3  Smart Scan      person + meeting context, captured together
 *   4  Follow-up, CRM  the relationship continues, and reaches the CRM
 *   5  Time, Event     what that saves, across a whole event
 *   6  Lifecycle, EI   before / during / after, and what is coming next
 *   7  Your ABC, Trust the identity behind it, and the systems it joins
 *   8  Pricing, CTA    what it costs, and the one thing to do now
 *
 * Scenes 4, 5, 6 and 7 are pairs: two chapters that share a ground and read as
 * one move, so the page lands as roughly eight cinematic scenes rather than
 * fourteen full-height pages.
 *
 * Every capability named here exists in the release this branch is cut from.
 * The one that does not — Event & Expo Intelligence — is labelled as coming
 * next wherever it appears, and is never purchasable.
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
    <div className="pub-root cine" aria-busy={redirecting || undefined}>
      {/* Without JavaScript nothing would ever mark a chapter as seen. */}
      <noscript>
        <style>
          {
            '.cine .cine-chapter :is(.pub-eyebrow,.cine-h,.pub-lead,.cine-rise,.cine-item,.cine-media){opacity:1!important;transform:none!important}'
          }
        </style>
      </noscript>
      <PublicHeader />

      <main>
        {/* 1 */}
        <LandingHero />
        {/* 2 */}
        <ProblemSection />
        {/* 3 */}
        <CaptureContextSection />
        {/* 4 */}
        <FollowUpSection />
        <CrmSection />
        {/* 5 */}
        <RoiSection />
        <EventWorkspaceSection />
        {/* 6 */}
        <LifecycleSection />
        <EventIntelligenceSection />
        {/* 7 */}
        <CardSection />
        <TrustSection />
        {/* 8 */}
        <PricingSection />
        <FinalCtaSection />
      </main>

      <PublicFooter />
    </div>
  )
}
