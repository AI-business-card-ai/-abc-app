import Button from '@/components/ui/abc/Button'
import HeroProductStory from '@/components/landing/hero/HeroProductStory'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * The public landing hero.
 *
 * Two things have to land at once, and they pull against each other. The
 * business outcome — a meeting becomes a relationship that reaches the CRM —
 * is what makes ABC worth more than the category it will otherwise be filed
 * under. The free entry is what makes it cheap to try. Lead with the free
 * card and ABC reads as a free digital business card; lead only with the
 * workflow and there is no reason to start today.
 *
 * So the copy carries the outcome and the button carries the price. The
 * heading names the whole arc, the supporting line says what ABC actually
 * does at each stage, and the word "free" appears once, on the CTA, where it
 * removes friction without becoming the product category.
 *
 * The visual then makes the same split spatially: the card the visitor can
 * create for nothing is the object in front, and the workflow it opens into
 * runs behind it. See HeroProductStory for why that ordering is the honest
 * one rather than only the pretty one.
 *
 * No hooks here on purpose, and every part of it is in the first HTML. The
 * entrance is CSS, so the buttons work before any JavaScript has run. The
 * headline's light is the one piece of script, and it only ever changes the
 * colour of text that is already painted — the LCP element never waits on it.
 */
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
            The support line carries what the headline compresses: ABC keeps
            more than contact details. Person, meeting, conversation, next step
            — the four things a scanned card or a LinkedIn connection loses.
          */}
          <p className="lh-lead">
            Scan a card and ABC keeps the person, the meeting, what you discussed and what happens
            next — then helps you follow up and moves the relationship into your CRM.
          </p>

          <div className="lh-actions">
            <Button href="/register" variant="gold" size="lg" className="lh-cta-primary">
              Create your free ABC Card
            </Button>
            {/*
              A real anchor, not a scroll handler. It works before hydration,
              it is keyboard-navigable and copyable for free, and the smooth
              scroll comes from the global scroll-behavior rule — which the
              reduced-motion block already turns off, so honouring the setting
              costs nothing here.
            */}
            <Button href="#how-it-works" variant="surface" size="lg" className="lh-cta-secondary">
              See how it works
            </Button>
          </div>

          {/*
            Verified against the signup flow before it was written: /register
            is a Supabase email/password or Google sign-up, onboarding is
            card-first and reaches a live public card at step 3, and nothing
            on either path touches Stripe. Checkout exists only behind an
            explicit visit to /pricing or /settings/billing. If that ever
            changes, this line has to go.
          */}
          <p className="lh-note">Free to create. No credit card required.</p>
        </div>

        <HeroProductStory />
      </div>
    </section>
  )
}
