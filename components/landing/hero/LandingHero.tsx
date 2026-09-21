import Button from '@/components/ui/abc/Button'
import HeroProductStory from '@/components/landing/hero/HeroProductStory'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 1 — the promise.
 *
 * In a few seconds a visitor should understand the whole arc: a meeting
 * happens, the card is scanned, the meeting is remembered, the follow-up goes
 * out, the relationship reaches the CRM. Nothing here explains a feature; the
 * chapters below do that.
 *
 * The four supporting lines are the lifecycle in the imperative, and the strip
 * underneath names its five stages, so the structure of the page is legible
 * before any scrolling happens.
 *
 * MEDIA SLOT — `hero` (see lib/landing/media.ts). A photograph of the moment
 * before this composition belongs behind the stage. Until it exists the product
 * story carries the scene: the free card in front, the workflow it opens into
 * running behind it. No stock photograph stands in, and no empty frame is
 * drawn — an unfilled box in a hero reads as a bug.
 *
 * No hooks here on purpose, and every part of it is in the first HTML. The
 * entrance is CSS, so the buttons work before any JavaScript has run. The
 * headline's light is the one piece of script, and it only ever changes the
 * colour of text that is already painted — the LCP element never waits on it.
 */

/** The lifecycle, named once, in the order the page then follows. */
const LIFECYCLE = ['Meet', 'Scan', 'Remember', 'Follow up', 'CRM']

export default function LandingHero() {
  return (
    <section id="hero" className="lh">
      {/*
        Light, not decoration. One warm source behind the card and a cool lift
        along the top edge, both far below the threshold where a gradient
        starts announcing itself. The bottom stop fades to the page background
        so the hero ends without drawing a line across the page.
      */}
      <div className="lh-ambient" aria-hidden="true" />

      <div className="lh-grid">
        <div className="lh-copy">
          <CinematicHeadline as="h1" variant="hero" className="lh-h1">
            From handshake to CRM in seconds.
          </CinematicHeadline>

          {/*
            Four sentences, one per stage of the lifecycle. They replace a
            paragraph that explained the same thing in one breath and read as
            product description rather than as a promise.
          */}
          <p className="lh-lead">
            Capture the person. Remember the meeting. Follow up with context. Move the relationship
            forward.
          </p>

          <div className="lh-actions">
            <Button href="/register" variant="gold" size="lg" className="lh-cta-primary">
              Get started
            </Button>
            {/*
              A real anchor, not a scroll handler. It works before hydration,
              it is keyboard-navigable and copyable for free, and the smooth
              scroll comes from the global scroll-behavior rule — which the
              reduced-motion block already turns off.
            */}
            <Button href="#how-it-works" variant="surface" size="lg" className="lh-cta-secondary">
              See how it works
            </Button>
          </div>

          {/*
            Verified against the signup flow before it was written: /register
            is a Supabase email/password or Google sign-up, onboarding is
            card-first and reaches a live public card, and nothing on either
            path touches Stripe. If that ever changes, this line has to go.
          */}
          <p className="lh-note">Free to start. No credit card required.</p>

          <ol className="lh-flow" aria-label="How ABC works, in five stages">
            {LIFECYCLE.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
        </div>

        {/* The mechanism that connects the meeting to the CRM. */}
        <HeroProductStory />
      </div>
    </section>
  )
}
