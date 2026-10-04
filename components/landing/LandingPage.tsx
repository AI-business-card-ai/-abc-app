'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import PublicHeader from '@/components/landing/PublicHeader'
import PublicFooter from '@/components/landing/PublicFooter'
import HeroScene from '@/components/landing/champagne/HeroScene'
import ProblemScene from '@/components/landing/champagne/ProblemScene'
import HowItWorksScene from '@/components/landing/champagne/HowItWorksScene'
import FollowUpScene from '@/components/landing/champagne/FollowUpScene'
import EventIntelligenceScene from '@/components/landing/champagne/EventIntelligenceScene'
import { FinalCtaScene, PricingStrip } from '@/components/landing/champagne/ClosingScenes'
import '@/app/landing-champagne.css'

/**
 * The public landing page — one sales story, in six scenes.
 *
 *   1  Hero              from handshake to CRM
 *   2  Problem           the meeting happened, the CRM knows nothing
 *   3  How it works      scan, context, next step, CRM
 *   4  Follow-up + CRM   the relationship continues, and reaches the CRM
 *   5  Event & Expo      before / during / after, and what is coming next
 *   6  Pricing + close   what it costs, and the one thing to do now
 *
 * The previous version ran to fourteen section components across eight
 * cinematic scenes on a near-black ground. It said several things twice —
 * follow-up and CRM were separate chapters making one point, lifecycle and
 * Event Intelligence another — and on a phone it was a very long way to the
 * end. This version drops the repetition rather than recolouring it.
 *
 * Those components are still in the repository and still carry the dark
 * `.pub-*` system, which /pricing, /privacy, /terms and the checkout-return
 * pages continue to use. Nothing here changes them: the champagne tokens are
 * scoped to `.lp-page`, so the shared header and footer are re-themed on this
 * page only.
 *
 * Every capability named here exists in the release this branch is cut from.
 * The one that does not — Event & Expo Intelligence — is labelled coming soon
 * wherever it appears and is never purchasable.
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
    <div className="pub-root lp-page" aria-busy={redirecting || undefined}>
      {/* Without JavaScript nothing marks a reveal as seen. */}
      <noscript>
        <style>{'.lp-reveal{opacity:1!important;transform:none!important}'}</style>
      </noscript>

      <PublicHeader menu />

      <main>
        <HeroScene />
        <ProblemScene />
        <HowItWorksScene />
        <FollowUpScene />
        <EventIntelligenceScene />
        <PricingStrip />
        <FinalCtaScene />
      </main>

      <PublicFooter />
    </div>
  )
}
