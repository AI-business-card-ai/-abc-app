import dynamic from 'next/dynamic'
import {
  IconDownload,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPhoto,
  IconShare2,
  IconWorld,
} from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

const PublicQrCode = dynamic(() => import('@/components/landing/PublicQrCode'), {
  ssr: false,
  loading: () => <div className="pub-qr" style={{ width: 150, height: 150 }} />,
})

/**
 * The free half of the product, staged as an object rather than described.
 *
 * The previous version of this section read as documentation: three icon +
 * heading + paragraph rows on the left, and on the right a single rectangle
 * with the QR, the actions, About and Looking for stacked inside it. Everything
 * in it was true, and none of it made anybody want the card.
 *
 * Two changes. The copy stops explaining what the product visibly does — the
 * QR, the save and the share are all right there in the composition, so
 * spelling them out in prose was saying the same thing twice, once weakly. And
 * the visual becomes two planes instead of one: the identity surface, and the
 * share code sitting slightly proud of its lower corner, casting onto it. Two
 * objects at different depths is what stops a product shot reading as a
 * screenshot of a page.
 *
 * The hero shows this card inside a phone. This shows it at full size, which is
 * also how somebody actually receives it — most people open a card on a screen
 * bigger than the one it was sent from.
 *
 * Every field is real: fullName, jobTitle, companyName, location, whatIDo
 * (About), lookingFor (Looking for), the showcase count, the vCard behind Save
 * contact, the share link, and the permanent public URL and QR.
 */
const DEMO_URL = 'https://abccard.io/u/martin'

/** What the composition cannot show for itself. Deliberately three short lines. */
const NOTES = [
  'Change your role or your number once — everyone who scans it from then on gets the new details.',
  'Save contact downloads a real vCard, so you land in the phonebook properly rather than as a screenshot.',
  'Room for what you actually do: About, what you are looking for, your links and your work.',
]

export default function CardSection() {
  return (
    <section id="card" className="pub-section pub-section--raised">
      <div className="pub-container">
        <div className="pub-split pub-split--card">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">Free ABC Card</p>
            <h2 className="pub-h2">A professional identity people actually keep.</h2>
            <p className="pub-lead">
              One permanent link and one QR code. Show it on your phone, put it in your signature,
              print it on a badge. Whoever opens it gets you — and can hand their details straight
              back.
            </p>

            <ul className="pub-notes">
              {NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            {/*
              Two planes. The card is the object; the QR sits in front of it,
              overlapping the lower-left corner and casting onto the surface
              below. The offset is what gives the composition depth — flattened
              into one panel it becomes a screenshot again.
            */}
            <div className="pub-profile">
              <article className="pub-profile-card">
                <header className="pub-profile-id">
                  <span className="pub-profile-avatar" aria-hidden="true">
                    MN
                  </span>
                  <div>
                    <p className="pub-profile-name">Martin Novák</p>
                    <p className="pub-profile-role">Head of Sales · MedTech GmbH</p>
                    <span className="pub-profile-loc">
                      <IconMapPin size={12} stroke={1.9} aria-hidden="true" />
                      Frankfurt, Germany
                    </span>
                  </div>
                </header>

                <div className="pub-profile-actions">
                  <span className="pub-profile-save">
                    <IconDownload size={15} stroke={1.9} aria-hidden="true" />
                    Save contact
                  </span>
                  <span className="pub-profile-share">
                    <IconShare2 size={15} stroke={1.8} aria-hidden="true" />
                    Share
                  </span>
                </div>

                <div className="pub-profile-block">
                  <p className="pub-profile-label">About</p>
                  <p className="pub-profile-text">
                    Exhibition stand design and build for medical technology brands across Europe.
                  </p>
                </div>

                <div className="pub-profile-block pub-profile-block--accent">
                  <p className="pub-profile-label">Looking for</p>
                  <p className="pub-profile-text">Distribution partners across DACH</p>
                </div>

                <div className="pub-profile-rows">
                  <span>
                    <IconMail size={13} stroke={1.7} aria-hidden="true" />
                    martin@medtech.de
                  </span>
                  <span>
                    <IconPhone size={13} stroke={1.7} aria-hidden="true" />
                    +49 69 1200 4408
                  </span>
                  <span>
                    <IconWorld size={13} stroke={1.7} aria-hidden="true" />
                    medtech.de
                  </span>
                  {/*
                    A count, not a gallery — the call the product's own compact
                    preview makes. Empty tiles read as a page still loading, and
                    filling them would mean inventing somebody's portfolio.
                  */}
                  <span>
                    <IconPhoto size={13} stroke={1.7} aria-hidden="true" />
                    Selected work · 6 images
                  </span>
                </div>
              </article>

              <div className="pub-profile-qr">
                <PublicQrCode value={DEMO_URL} size={150} />
                <p className="pub-profile-qr-url">abccard.io/u/martin</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
