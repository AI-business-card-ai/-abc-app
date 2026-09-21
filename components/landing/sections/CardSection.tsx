import dynamic from 'next/dynamic'
import {
  IconDeviceMobile,
  IconDownload,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPhoto,
  IconShare2,
  IconWorld,
} from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

const PublicQrCode = dynamic(() => import('@/components/landing/PublicQrCode'), {
  ssr: false,
  loading: () => <div className="pub-qr" style={{ width: 150, height: 150 }} />,
})

/**
 * Scene 7a — your ABC: the identity the relationship workflow starts from.
 *
 * Deliberately placed late. Led with, it would file ABC under "digital
 * business card", which is the category this page exists to escape; arriving
 * here, after the meeting workflow, it reads as what it is — the thing you
 * hand over, and the reason the other side can hand something back.
 *
 * Every capability listed was checked against the shipping card schema
 * (lib/types.ts, lib/card/*): name, role, company, photo, cover and company
 * logo, tagline, About and Looking for, location and languages, email, phone,
 * WhatsApp, website, calendar link, eight social profiles behind per-link
 * toggles, a permanent public link with QR, a real vCard, and a Showcase
 * gallery of up to eight images with captions.
 *
 * Deliberately not claimed, because the shipping Showcase stores images only:
 * video, brochures, PDFs and datasheets. Those belong to the planned Event &
 * Expo Intelligence material layer, and saying them here would be a promise
 * this release cannot keep.
 */

const DEMO_URL = 'https://abccard.io/u/martin'

/** What the composition cannot show for itself. */
const NOTES = [
  'Show what you choose: contact details, About, what you are looking for, your links and your work — each one on or off.',
  'Change your role or your number once and everyone who opens it from then on gets the new details.',
  'Save contact downloads a real vCard, so you land in the phonebook properly rather than as a screenshot.',
  'Add ABC to your home screen and share your card from your phone in seconds.',
]

export default function CardSection() {
  return (
    <Chapter
      id="card"
      className="pub-section"
      labelledBy="card-title"
      glow={{ x: '68%', y: '48%' }}
    >
      <div className="pub-container">
        <div className="pub-split pub-split--card">
          <div className="pub-split-copy">
            <p className="pub-eyebrow">Your ABC</p>
            <CinematicHeadline id="card-title" className="pub-h2">
              Your card. Always with you.
            </CinematicHeadline>
            <p className="pub-lead">
              Share the essentials — or tell the whole story. Your ABC can be as simple or as rich
              as you want it to be, and the person you just met opens it without installing
              anything.
            </p>

            <ul className="pub-notes cine-rise">
              {NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <p className="cine-callout cine-rise">You decide what people see.</p>

            <p className="pub-body cine-rise">
              <IconDeviceMobile size={15} stroke={1.8} aria-hidden="true" /> They can send their own
              details straight back, so an exchange goes both ways — included with every free ABC.
            </p>
          </div>

          <div className="pub-split-media cine-media">
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
                    My work · 6 images
                  </span>
                </div>
              </article>

              <div className="pub-profile-qr">
                <PublicQrCode value={DEMO_URL} size={150} />
                <p className="pub-profile-qr-url">abccard.io/u/martin</p>
              </div>
            </div>
          </div>
        </div>

        <p className="cine-statement cine-rise">
          A paper card tells them how to contact you. Your ABC can show them who you are.
        </p>
      </div>
    </Chapter>
  )
}
