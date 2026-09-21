import Link from 'next/link'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 8b — the close.
 *
 * The page's one light chapter: after a long dark composition the lights come
 * up, the type turns graphite and the headline takes the bronze variant of the
 * same light. It ends on the promise it opened with, so the argument closes
 * where it started.
 *
 * No social proof anywhere: ABC has no customer numbers, testimonials or logos
 * it can truthfully show yet, and inventing them is the fastest way to make a
 * serious B2B product look like it is pretending.
 *
 * MEDIA SLOT — `final-cta`: a warm, human business moment. Until it exists the
 * chapter carries itself on type and light rather than on stock photography.
 */
export function FinalCtaSection() {
  return (
    <Chapter className="pub-section cine-final" labelledBy="final-cta-title">
      <div className="pub-container">
        <div className="pub-head-center">
          <CinematicHeadline id="final-cta-title" className="pub-h2" tone="light">
            Your next handshake could become your next opportunity.
          </CinematicHeadline>
          <p className="pub-lead">
            Don’t let a valuable conversation end as a business card in your pocket. Capture the
            person. Remember the context. Follow up while it matters. Move the relationship forward.
          </p>

          <p className="cine-final-promise">From handshake to CRM in seconds.</p>

          <div className="pub-actions pub-actions-center cine-rise">
            <Link href="/register" className="pub-btn cine-btn-graphite">
              Start with ABC
            </Link>
            <Link href="/#pricing" className="pub-btn cine-btn-outline">
              See pricing
            </Link>
          </div>
          <p className="pub-body cine-rise cine-final-note">Free to start. No credit card required.</p>
        </div>
      </div>
    </Chapter>
  )
}
