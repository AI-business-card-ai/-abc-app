import {
  IconCalendarEvent,
  IconCloudUpload,
  IconDownload,
  IconMail,
  IconMapPin,
  IconMessage,
  IconScan,
  IconTargetArrow,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'

/**
 * The hero's product visual: one meeting, from the card to the CRM.
 *
 * Built as two objects that touch rather than a row of feature tiles, because
 * the freemium split is a spatial fact and not a caption. The card is what a
 * visitor creates for nothing, so it is the object in front, fully drawn, at
 * full contrast. The workflow that card opens into runs behind and past it —
 * physically overlapped, so it reads as the same system continuing rather than
 * a second product parked alongside. "My card is where I enter ABC, and ABC
 * does not stop there" is the whole composition, and it is carried by the
 * geometry, so it survives being screenshotted, translated or read aloud.
 *
 * That ordering is also the honest one. The CTA above offers the card free;
 * the rail is everything that costs money — capture, bought in Smart Scan
 * packs, and the workflow after it, which is ABC Pro. The rail is labelled
 * "after the handshake" rather than with either product name, because the hero
 * is not the place to teach the pricing model: two commercial layers stamped
 * across four stations turns a product story into a rate card. The pricing
 * section does that job properly, further down.
 *
 * Everything named here is implemented. The field labels are the ones the
 * contact screen uses (Met at / Discussed / Next step / Follow up), the
 * channels are the composers ABC actually opens, and the CRM row is the three
 * providers plus the CSV export that exist in lib/crm. The person is the
 * repository's existing demo identity, not a customer.
 *
 * MEDIA SLOT — HERO_MEETING_MEDIA (not yet available, deliberately absent).
 * A photograph of the moment before this composition belongs behind the stage,
 * masked to the top-right and held under the ambient light. It is not stubbed
 * with a grey box: an empty frame would dominate a hero this quiet and would
 * read as a bug rather than a placeholder. When the asset exists it mounts as
 * the first child of .lh-stage using the .lh-meeting-media hook already
 * defined in globals.css. Required: a genuine professional exchange — a
 * handshake, or a phone held between two people — in a real business or
 * exhibition environment, international cast, natural cinematic light, no
 * legible third-party branding, landscape, minimum 2000px wide, with the right
 * two thirds quiet enough to carry the card and rail over it.
 */

type Field = { Icon: TablerIcon; label: string; value: string }

/*
  The meeting, in the fields the contact screen stores it in — and the same
  meeting every chapter below the hero returns to, so the page tells one story
  rather than a different anecdote per section.
*/
const MEETING: Field[] = [
  { Icon: IconMapPin, label: 'Met at', value: 'Ambiente 2026 · Hall 4' },
  { Icon: IconMessage, label: 'Discussed', value: 'DACH distribution' },
  { Icon: IconTargetArrow, label: 'Next step', value: 'Send proposal next week' },
]

/** Where ABC can put the contact and the meeting. Wordmarks, not logos. */
const CRM = ['HubSpot', 'Pipedrive', 'Salesforce', 'CSV']

export default function HeroProductStory() {
  return (
    <div className="lh-story">
      <div className="lh-stage">
        {/* ---------- The card: free, in front ---------- */}
        <div className="lh-device">
          <p className="lh-tag">
            <span className="lh-tag-dot lh-tag-dot-gold" aria-hidden="true" />
            ABC Card — free
          </p>

          <div className="lh-phone">
            <div className="lh-phone-screen">
              <div className="lh-card">
                <div className="lh-card-top">
                  {/*
                    Initials, not a stock portrait. This is the fallback the
                    card itself renders when no photo is set, so it is a real
                    state of a real screen — and it stops a person who does not
                    exist from being presented as though they did.
                  */}
                  <span className="lh-card-avatar" aria-hidden="true">
                    MN
                  </span>
                  <p className="lh-card-name">Martin Novák</p>
                  <p className="lh-card-sub">Head of Sales · MedTech GmbH</p>
                  <span className="lh-card-loc">
                    <IconMapPin size={12} stroke={1.9} aria-hidden="true" />
                    Frankfurt, Germany
                  </span>
                </div>

                <div className="lh-card-save">
                  <IconDownload size={15} stroke={1.9} aria-hidden="true" />
                  Save contact
                </div>

                <div className="lh-card-rows">
                  <span className="lh-card-row">
                    <IconMail size={14} stroke={1.7} aria-hidden="true" />
                    martin@medtech.de
                  </span>
                  <span className="lh-card-row">
                    <IconWorld size={14} stroke={1.7} aria-hidden="true" />
                    medtech.de
                  </span>
                </div>

                {/*
                  "Looking for" is a real field on the card, and the one that
                  makes a free ABC Card worth scanning rather than merely
                  worth saving. It also keeps the free product from reading as
                  a stripped-down tier, which is the whole point of showing it
                  at full contrast here.
                */}
                <section className="lh-card-seeking">
                  <p className="lh-card-seeking-label">Looking for</p>
                  <p className="lh-card-seeking-text">Distribution partners across DACH</p>
                </section>

                <p className="lh-card-url">abccard.io/u/martin</p>
              </div>
            </div>
          </div>
        </div>

        {/* The join, on the layouts where the two objects stack instead of overlapping. */}
        <span className="lh-thread" aria-hidden="true" />

        {/* ---------- The workflow: ABC Pro, behind and past it ---------- */}
        <div className="lh-rail">
          <p className="lh-tag lh-tag-rail">
            <span className="lh-tag-dot" aria-hidden="true" />
            After the handshake
          </p>

          <ol className="lh-steps">
            <li className="lh-step">
              <span className="lh-step-icon" aria-hidden="true">
                <IconScan size={17} stroke={1.7} />
              </span>
              <div className="lh-step-body">
                <p className="lh-step-title">Contact captured</p>
                <p className="lh-step-note">Scan the card you were handed, or exchange yours.</p>
              </div>
            </li>

            <li className="lh-step lh-step-wide">
              <span className="lh-step-icon" aria-hidden="true">
                <IconMessage size={17} stroke={1.7} />
              </span>
              <div className="lh-step-body">
                <p className="lh-step-title">Meeting remembered</p>
                <dl className="lh-fields">
                  {MEETING.map(({ Icon, label, value }) => (
                    <div className="lh-field" key={label}>
                      <dt className="lh-field-label">
                        <Icon size={13} stroke={1.8} aria-hidden="true" />
                        {label}
                      </dt>
                      <dd className="lh-field-value">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>

            <li className="lh-step">
              <span className="lh-step-icon" aria-hidden="true">
                <IconMail size={17} stroke={1.7} />
              </span>
              <div className="lh-step-body">
                <p className="lh-step-title">
                  Follow-up ready
                  <span className="lh-step-due">
                    <IconCalendarEvent size={12} stroke={1.9} aria-hidden="true" />
                    Tomorrow
                  </span>
                </p>
                {/*
                  Nothing is sent until the owner presses Send. With Gmail
                  connected ABC sends from their own mailbox; otherwise each
                  channel opens its own composer with the text already in it.
                */}
                <p className="lh-step-note">
                  Drafted from what you discussed. Send it from your Gmail, or open WhatsApp or
                  LinkedIn.
                </p>
              </div>
            </li>

            <li className="lh-step">
              <span className="lh-step-icon" aria-hidden="true">
                <IconCloudUpload size={17} stroke={1.7} />
              </span>
              <div className="lh-step-body">
                <p className="lh-step-title">In your CRM</p>
                <p className="lh-chips">
                  {CRM.map((name) => (
                    <span className="lh-chip" key={name}>
                      {name}
                    </span>
                  ))}
                </p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
