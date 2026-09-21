import {
  IconCalendarEvent,
  IconCheck,
  IconHistory,
  IconMapPin,
  IconMessage,
  IconQrcode,
  IconScan,
  IconTargetArrow,
  IconUserPlus,
} from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import Equation from '@/components/landing/cinema/Equation'

/**
 * Scene 3 — Smart Scan and meeting context, as one argument.
 *
 * These were two chapters and are now one, because separating them made
 * scanning look like the product. It is not: scanning is the entry point, and
 * the value is the person, the conversation and the next step held together.
 * The panel shows that literally — the scanned card resolves into a contact,
 * and the meeting settles around it in the fields the contact screen stores.
 *
 * Everything here is in the shipping release: multi-card batch scanning with
 * remove and restore, meetings recorded against one person, and history that
 * stacks instead of duplicating the contact. Meeting context is not Pro-gated,
 * so nothing in this scene carries a Pro label. Smart Scans are paid for in
 * credits by every account, Pro or not — that belongs to pricing, not here.
 *
 * MEDIA SLOT — `smart-scan`. Until the animation exists, the real UI carries it.
 */

/** The meeting, in the fields the contact screen stores it in. */
const MEETING = [
  { Icon: IconMapPin, label: 'Met at', value: 'Ambiente 2026 · Hall 4' },
  { Icon: IconMessage, label: 'Discussed', value: 'DACH distribution for the 2027 range' },
  { Icon: IconTargetArrow, label: 'Next step', value: 'Send proposal next week' },
  { Icon: IconCalendarEvent, label: 'Follow up', value: 'Tue, 9 Feb' },
]

const POINTS = [
  {
    Icon: IconScan,
    title: 'Scan the card',
    body: 'One card, or the whole stack from a busy stand. Review what ABC found and remove anything that is not a card.',
  },
  {
    Icon: IconMessage,
    title: 'Add the context',
    body: 'Where you met, what you discussed, what they need — kept with the person, not in a note you will never find.',
  },
  {
    Icon: IconTargetArrow,
    title: 'Keep the next step',
    body: 'What you promised, and when it is due, so the follow-up writes itself from something real.',
  },
]

export default function CaptureContextSection() {
  return (
    <Chapter
      id="product"
      className="pub-section"
      labelledBy="product-title"
      glow={{ x: '74%', y: '50%' }}
    >
      <div className="pub-container">
        <div className="pub-split cine-bleed">
          <div className="pub-split-copy">
            <p className="pub-eyebrow">Smart Scan</p>
            <CinematicHeadline id="product-title" className="pub-h2">
              Scan the person. Capture the meeting.
            </CinematicHeadline>
            <p className="pub-lead">
              A business card tells you who. ABC keeps why you met, what you discussed and what
              should happen next connected to that person.
            </p>

            <ul className="pub-list cine-rise">
              {POINTS.map(({ Icon, title, body }) => (
                <li className="pub-list-item" key={title}>
                  <span className="pub-list-icon" aria-hidden="true">
                    <Icon size={16} stroke={1.7} />
                  </span>
                  <div>
                    <h3 className="pub-h3">{title}</h3>
                    <p className="pub-body">{body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <ul className="cine-notes cine-rise">
              <li>
                <IconUserPlus size={15} stroke={1.8} aria-hidden="true" />
                Scan someone ABC already has and the meeting joins their history instead of making a
                second copy of them.
              </li>
              <li>
                <IconQrcode size={15} stroke={1.8} aria-hidden="true" />
                Or they scan your ABC and send their details straight back — no app on their side.
              </li>
            </ul>
          </div>

          <div className="pub-split-media cine-media cine-stage">
            <div className="pub-panel">
              <p className="pub-panel-tag">Scan · contact · meeting</p>

              <div className="cine-capture">
                {/* The physical card, being read. */}
                <div className="pub-scan-frame cine-capture-scan" aria-hidden="true">
                  <span className="pub-scan-corner pub-scan-corner--tl" />
                  <span className="pub-scan-corner pub-scan-corner--tr" />
                  <span className="pub-scan-corner pub-scan-corner--bl" />
                  <span className="pub-scan-corner pub-scan-corner--br" />
                  <div className="pub-scan-card">
                    <p className="pub-scan-card-name">John Smith</p>
                    <p className="pub-scan-card-sub">Acme GmbH · Sales Director</p>
                    <span className="pub-scan-card-rule" />
                    <p className="pub-scan-card-meta">john.smith@acme.de · +49 69 1200 4408</p>
                  </div>
                </div>

                <p className="pub-scan-status">
                  <IconCheck size={14} stroke={2.4} aria-hidden="true" />
                  Contact created
                </p>

                {/* And what the card could never carry. */}
                <div className="cine-capture-record">
                  <div className="pub-meeting-head">
                    <span className="pub-scan-avatar" aria-hidden="true">
                      JS
                    </span>
                    <div>
                      <p className="pub-h3">John Smith</p>
                      <p className="pub-body">Sales Director · Acme GmbH</p>
                    </div>
                  </div>

                  <dl className="pub-fields">
                    {MEETING.map(({ Icon, label, value }) => (
                      <div className="pub-field" key={label}>
                        <dt className="pub-field-label">
                          <Icon size={13} stroke={1.8} aria-hidden="true" />
                          {label}
                        </dt>
                        <dd className="pub-field-value">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="pub-meeting-history">
                    <IconHistory size={13} stroke={1.8} aria-hidden="true" />
                    Second meeting since Mar 2025
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Equation
          terms={['Person', 'Conversation', 'Context', 'Next step']}
          result={['Ready for follow-up and CRM']}
        />

        <p className="cine-statement cine-rise">
          A contact is data. A meeting is context. ABC keeps both together.
        </p>
      </div>
    </Chapter>
  )
}
