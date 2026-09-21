import { IconCalendarEvent, IconCheck, IconChevronRight } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 5b — one meeting becomes a whole event.
 *
 * Event workspaces ship in this release (app/events). The panel mirrors what
 * the event screen shows: who was met, what was discussed, what was promised,
 * whether the follow-up has gone and whether it reached the CRM — with the
 * same In CRM / Not in CRM filter the product has.
 *
 * The person stays one contact across events, which is the Person ≠ Encounter
 * rule made visible: meeting John at a second fair adds a row to that fair,
 * not a second John.
 *
 * The rows are interface demonstration, not results. No figure here is a claim
 * about what any customer achieved.
 *
 * MEDIA SLOT — `event-workspace`.
 */

const EVENTS = [
  { name: 'Ambiente 2026', when: 'Feb 2026', active: true },
  { name: 'MEDICA', when: 'Nov 2025', active: false },
  { name: 'Interzoo', when: 'May 2025', active: false },
]

const MEETINGS = [
  {
    initials: 'JS',
    name: 'John Smith',
    company: 'Acme GmbH',
    discussed: 'DACH distribution for the 2027 range',
    state: 'Follow-up ready',
    inCrm: false,
  },
  {
    initials: 'AW',
    name: 'Anna Weber',
    company: 'XYZ Robotics',
    discussed: 'Replacement supplier for 2027',
    state: 'Followed up',
    inCrm: true,
  },
  {
    initials: 'MK',
    name: 'Michael Klein',
    company: 'Example AG',
    discussed: 'Pricing for a pilot line',
    state: 'Next step due',
    inCrm: false,
  },
]

export default function EventWorkspaceSection() {
  return (
    <Chapter
      id="events"
      className="pub-section cine-section--continued"
      labelledBy="events-title"
      glow={{ x: '50%', y: '72%' }}
    >
      <div className="pub-container">
        <div className="cine-stack">
          <div className="cine-stack-head">
            <div>
              <p className="pub-eyebrow">Event Workspace</p>
              <CinematicHeadline id="events-title" className="pub-h2">
                Your event. Every meeting. One place.
              </CinematicHeadline>
              <p className="pub-lead">
                A trade fair can mean dozens of conversations in just a few hours. ABC keeps them
                together — so you can see who you met, what you discussed and what still needs to
                happen.
              </p>
            </div>

            <ul className="pub-notes cine-rise">
              <li>Filter an event by what has already reached your CRM and what has not.</li>
              <li>
                Each person stays one contact. Meet them again at another event and that meeting
                appears there too — their history stays in one place.
              </li>
            </ul>
          </div>

          <div className="cine-media cine-stage cine-stage--wide">
            <div className="pub-panel">
              <p className="pub-panel-tag">Events</p>

              <div className="pub-events">
                <ul className="pub-events-list" aria-hidden="true">
                  {EVENTS.map(({ name, when, active }) => (
                    <li key={name} className={`pub-event${active ? ' is-active' : ''}`}>
                      <IconCalendarEvent size={14} stroke={1.8} />
                      <span className="pub-event-name">{name}</span>
                      <span className="pub-event-when">{when}</span>
                    </li>
                  ))}
                </ul>

                <div className="pub-event-detail">
                  <div className="pub-event-filters" aria-hidden="true">
                    <span className="pub-chip pub-chip-sm is-active">All</span>
                    <span className="pub-chip pub-chip-sm">In CRM</span>
                    <span className="pub-chip pub-chip-sm">Not in CRM</span>
                  </div>

                  <ul className="pub-event-meetings">
                    {MEETINGS.map(({ initials, name, company, discussed, state, inCrm }) => (
                      <li key={name} className="pub-event-meeting">
                        <span className="pub-scan-avatar" aria-hidden="true">
                          {initials}
                        </span>
                        <div className="pub-event-meeting-body">
                          <p className="pub-batch-name">
                            {name} · {company}
                            <IconChevronRight size={13} stroke={2} aria-hidden="true" />
                          </p>
                          <p className="pub-batch-sub">{discussed}</p>
                          <p className="pub-event-promise">{state}</p>
                        </div>
                        <span className={`pub-event-crm${inCrm ? ' is-in' : ''}`}>
                          {inCrm ? (
                            <>
                              <IconCheck size={11} stroke={3} aria-hidden="true" />
                              In CRM
                            </>
                          ) : (
                            'Not in CRM'
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="cine-statement cine-rise">
          Leave the event with a pipeline — not a pile of business cards.
        </p>
      </div>
    </Chapter>
  )
}
