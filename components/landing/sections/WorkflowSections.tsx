import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconCheck,
  IconCloudUpload,
  IconHistory,
  IconMail,
  IconMapPin,
  IconMessage,
  IconMessage2,
  IconQrcode,
  IconScan,
  IconTargetArrow,
  IconUserPlus,
} from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

/**
 * The four chapters after the card: capture, remember, follow up, CRM.
 *
 * One file because they are one argument and share one layout — four separate
 * modules would invite four separate drifts in spacing and tone. They alternate
 * sides down the page so the eye has somewhere to go, but the copy always
 * precedes its panel in the DOM, so a phone and a screen reader both get the
 * claim before the illustration of it.
 *
 * Everything named exists in the release candidate. The meeting fields are the
 * contact screen's own labels, Multi-Card review is the batch scan flow with its
 * remove and restore, the CRM steps are the objects the exporter writes, and
 * sending is only ever something the owner does: from their own Gmail when they
 * have connected it, otherwise through each channel's own composer.
 *
 * There is no enrichment copy anywhere in this file. The third-party enrichment
 * providers were removed from the product, and "enriched in the background" had
 * outlived them.
 */

/* ---------------------------------------------------------------- capture */

/** A Multi-Card review, as the batch screen shows it. One detection was not a card. */
const BATCH = [
  { initials: 'MN', name: 'Martin Novák', company: 'MedTech GmbH', removed: false },
  { initials: 'AW', name: 'Anna Weber', company: 'Weber & Söhne GmbH', removed: false },
  { initials: '—', name: 'Not a business card', company: 'Removed from this scan', removed: true },
]

export function CaptureSection() {
  return (
    <section id="capture" className="pub-section">
      <div className="pub-container">
        <div className="pub-split">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">Smart Scan</p>
            <h2 className="pub-h2">One card, or the whole stack.</h2>
            <p className="pub-lead">
              Scan the card you were handed and ABC turns it into a contact and a meeting — while
              you are still standing there, not typed up in a hotel room three days later.
            </p>

            <ul className="pub-list">
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconScan size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Several cards in one scan</h3>
                  <p className="pub-body">
                    Lay out the cards from a busy stand and scan them together. Review what ABC
                    found, remove anything that is not a card, restore it if you change your mind.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconUserPlus size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Someone you already know</h3>
                  <p className="pub-body">
                    Scan a person ABC already has and the new meeting joins their history, instead
                    of creating a second copy of them.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconQrcode size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Or they scan yours</h3>
                  <p className="pub-body">
                    They open your ABC Card and can send their details straight back — no app and
                    no account on their side.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            <div className="pub-panel">
              <p className="pub-panel-tag">Multi-Card review</p>
              <div className="pub-scan">
                <div className="pub-scan-frame" aria-hidden="true">
                  <span className="pub-scan-corner pub-scan-corner--tl" />
                  <span className="pub-scan-corner pub-scan-corner--tr" />
                  <span className="pub-scan-corner pub-scan-corner--bl" />
                  <span className="pub-scan-corner pub-scan-corner--br" />
                  <div className="pub-scan-stack">
                    <div className="pub-scan-card pub-scan-card--back">
                      <p className="pub-scan-card-name">Anna Weber</p>
                      <p className="pub-scan-card-sub">Weber &amp; Söhne GmbH</p>
                    </div>
                    <div className="pub-scan-card">
                      <p className="pub-scan-card-name">Martin Novák</p>
                      <p className="pub-scan-card-sub">MedTech GmbH</p>
                      <span className="pub-scan-card-rule" />
                      <p className="pub-scan-card-meta">martin@medtech.de · +49 69 1200 4408</p>
                    </div>
                  </div>
                </div>

                <p className="pub-scan-status">
                  <IconCheck size={14} stroke={2.4} aria-hidden="true" />
                  3 found · 2 cards to save
                </p>

                <ul className="pub-batch">
                  {BATCH.map(({ initials, name, company, removed }) => (
                    <li key={name} className={`pub-batch-row${removed ? ' is-removed' : ''}`}>
                      <span className="pub-scan-avatar" aria-hidden="true">
                        {initials}
                      </span>
                      <div className="pub-batch-text">
                        <p className="pub-batch-name">{name}</p>
                        <p className="pub-batch-sub">{company}</p>
                      </div>
                      <span className={removed ? 'pub-batch-restore' : 'pub-scan-added'}>
                        {removed ? 'Restore' : 'Contact'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- remember */

const MEETING = [
  { Icon: IconMapPin, label: 'Met at', value: 'Messe Frankfurt · 2 Sep 2026' },
  { Icon: IconMessage, label: 'Discussed', value: 'New booth build for Q1, 60–80 m², two levels' },
  { Icon: IconTargetArrow, label: 'Next step', value: 'Send layout and indicative pricing' },
  { Icon: IconCalendarEvent, label: 'Follow up', value: 'Thu, 3 Sep' },
]

export function RememberSection() {
  return (
    <section id="remember" className="pub-section pub-section--raised">
      <div className="pub-container">
        <div className="pub-split pub-split--flip">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">Remember</p>
            <h2 className="pub-h2">Remember the meeting, not just the contact.</h2>
            <p className="pub-lead">
              Anyone can store a phone number. What decides whether a meeting turns into business is
              whether you still know, three weeks later, where you met, what you actually talked
              about, and what you promised to do next. ABC keeps that with the person.
            </p>

            <ul className="pub-list">
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconMessage size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">The meeting, not just the contact</h3>
                  <p className="pub-body">
                    Where and when you met, the event, what was discussed, the opportunity, and the
                    next step — recorded once, against the person.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconHistory size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Every time you meet again</h3>
                  <p className="pub-body">
                    Meetings stack up as history rather than overwriting each other, so a
                    relationship you have built over three trade fairs reads like one.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            <div className="pub-panel">
              <p className="pub-panel-tag">Meeting context</p>

              <div className="pub-meeting">
                <div className="pub-meeting-head">
                  <span className="pub-scan-avatar" aria-hidden="true">
                    MN
                  </span>
                  <div>
                    <p className="pub-h3">Martin Novák</p>
                    <p className="pub-body">Head of Sales · MedTech GmbH</p>
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
                  Third meeting since Mar 2025
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- follow up */

const CHANNELS = [
  { Icon: IconMail, label: 'Email' },
  { Icon: IconBrandWhatsapp, label: 'WhatsApp' },
  { Icon: IconBrandLinkedin, label: 'LinkedIn' },
  { Icon: IconMessage2, label: 'SMS' },
]

export function FollowUpSection() {
  return (
    <section id="followup" className="pub-section">
      <div className="pub-container">
        <div className="pub-split">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">Follow up</p>
            <h2 className="pub-h2">Context is what makes a follow-up land.</h2>
            <p className="pub-lead">
              ABC drafts from the meeting you actually had — the event, the topic, the next step you
              agreed — so the message reads like it came from the person who was standing there.
              Connect Gmail and send it from your own mailbox, or open WhatsApp or LinkedIn with the
              text ready.
            </p>

            <ul className="pub-list">
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconMessage size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Written from the meeting</h3>
                  <p className="pub-body">
                    Not a template with a name dropped in. The draft references what you discussed
                    and what you said you would do.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconCheck size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Nothing goes out until you press Send</h3>
                  <p className="pub-body">
                    You review and edit every draft. With Gmail connected it is sent from your own
                    address; ABC only ever sends the message you approved.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            <div className="pub-panel">
              <p className="pub-panel-tag">Smart Follow-up · ABC Pro</p>

              <div className="pub-draft">
                <div className="pub-draft-channels" role="list">
                  {CHANNELS.map(({ Icon, label }, i) => (
                    <span
                      role="listitem"
                      key={label}
                      className={`pub-draft-channel${i === 0 ? ' is-active' : ''}`}
                    >
                      <Icon size={14} stroke={1.8} aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                </div>

                <div className="pub-draft-body">
                  <p className="pub-draft-subject">Booth concept for Q1 — following up from Frankfurt</p>
                  <p className="pub-draft-text">
                    Hi Martin,
                    <br />
                    <br />
                    Good to meet you at Messe Frankfurt on Tuesday. You mentioned you are planning a
                    60–80 m² stand on two levels for Q1 — I have put together an indicative layout
                    and pricing for that footprint.
                    <br />
                    <br />
                    Shall I send it over this week?
                  </p>
                </div>

                <div className="pub-draft-foot">
                  <span className="pub-draft-open">
                    <IconMail size={14} stroke={1.9} aria-hidden="true" />
                    Send from Gmail
                  </span>
                  <span className="pub-draft-note">Only when you press Send</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- CRM */

const PUSH_STEPS = ['Contact', 'Company', 'Association', 'Meeting', 'Follow-up task']
const DESTINATIONS = ['HubSpot', 'Salesforce', 'Pipedrive']

export function CrmSection() {
  return (
    <section id="crm" className="pub-section pub-section--raised">
      <div className="pub-container">
        <div className="pub-split pub-split--flip">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">CRM</p>
            <h2 className="pub-h2">The meeting should not die on the way to your CRM.</h2>
            <p className="pub-lead">
              When the relationship is worth tracking, push it across. The person, their company,
              the meeting you recorded and the follow-up task all land as proper records — not one
              contact row with an empty notes field.
            </p>

            <ul className="pub-list">
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconCloudUpload size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">You choose when and where</h3>
                  <p className="pub-body">
                    Nothing leaves ABC on its own. Exporting is an explicit action, to the one
                    destination you pick — connecting two CRMs is not permission to write to both.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconCheck size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Reported step by step</h3>
                  <p className="pub-body">
                    An export can genuinely half-succeed. ABC tells you which records landed instead
                    of showing one green tick over the top of it.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            <div className="pub-panel">
              <p className="pub-panel-tag">CRM sync · ABC Pro</p>

              <div className="pub-crm">
                <ul className="pub-chips pub-crm-dest">
                  {DESTINATIONS.map((name, i) => (
                    <li key={name} className={`pub-chip pub-chip-sm${i === 0 ? ' is-active' : ''}`}>
                      {name}
                    </li>
                  ))}
                </ul>

                <ul className="pub-crm-steps">
                  {PUSH_STEPS.map((step) => (
                    <li key={step}>
                      <span className="pub-crm-tick" aria-hidden="true">
                        <IconCheck size={11} stroke={3} />
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>

                <p className="pub-crm-note">Pushed to HubSpot · 5 records</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
