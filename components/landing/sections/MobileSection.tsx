import { IconCamera, IconDeviceMobile, IconDevices } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * How ABC runs on a phone, stated as narrowly as the product supports.
 *
 * The release candidate is an installable web app (public/manifest.json,
 * display: standalone) that uses the phone camera for Smart Scan. That is what
 * this section says, and all it says.
 *
 * Deliberately absent:
 *  - App Store and Google Play badges. Native shells exist in the codebase, but
 *    nothing is published, and a store badge that leads nowhere is worse than
 *    none. Whether to say "apps coming soon" is the owner's call.
 *  - Any offline promise. Scans, notes and contacts are saved when their
 *    request succeeds; nothing is queued on the device. The RC's own offline
 *    page records that an earlier "we'll send it when you're back online" line
 *    was never true.
 */

const FACTS = [
  {
    Icon: IconDeviceMobile,
    title: 'Install it from the browser',
    body: 'Add ABC to your home screen and it opens full screen, like any other app on your phone.',
  },
  {
    Icon: IconCamera,
    title: 'Your phone camera does the scanning',
    body: 'Point it at one card or several. Nothing to buy, nothing to pair.',
  },
  {
    Icon: IconDevices,
    title: 'Same account everywhere',
    body: 'Scan on your phone in the hall, follow up at your desk afterwards.',
  },
]

export default function MobileSection() {
  return (
    <Chapter className="pub-section pub-section--tight" labelledBy="mobile-title">
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">On your phone</p>
          <CinematicHeadline id="mobile-title" className="pub-h2">
            Built for the hall, not the desk.
          </CinematicHeadline>
        </div>

        <div className="pub-grid pub-grid--3 cine-facts">
          {FACTS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} className="pub-card" delay={i * 70}>
              <span className="pub-card-icon" aria-hidden="true">
                <Icon size={17} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{title}</h3>
              <p className="pub-body">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </Chapter>
  )
}
