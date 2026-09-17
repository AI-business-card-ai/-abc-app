import { IconCalendarEvent, IconCheck, IconChevronRight } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Event workspaces — shipping in the release candidate (app/events).
 *
 * Mirrors what the event screen actually shows: one event, who was met there,
 * what was discussed, what was promised, and whether each meeting reached the
 * CRM, filterable by In CRM / Not in CRM. The person is the one global contact —
 * there is no event-local copy of them — which is the Person ≠ Encounter rule
 * made visible: meeting Martin at a second fair adds a row to that fair, not a
 * second Martin.
 *
 * Composed differently from the chapters above it: the copy leads across the
 * top and the workspace opens underneath at full measure, on its own stage,
 * because an event is the one screen where the width is the point — the list
 * of events and the people inside one of them, side by side.
 *
 * The rows are interface demonstration, not results. No figure here is a claim
 * about what any customer achieved.
 */

const EVENTS = [
  { name: 'Messe Frankfurt', when: 'Sep 2026', active: true },
  { name: 'MEDICA', when: 'Nov 2025', active: false },
  { name: 'Interzoo', when: 'May 2025', active: false },
]

const MEETINGS = [
  {
    initials: 'MN',
    name: 'Martin Novák',
    discussed: 'Booth build for Q1, two levels',
    promised: 'Send layout and pricing',
    inCrm: true,
  },
  {
    initials: 'AW',
    name: 'Anna Weber',
    discussed: 'Replacement supplier for 2027',
    promised: 'Intro call next week',
    inCrm: false,
  },
]

export default function EventWorkspaceSection() {
  return (
    <Chapter
      id="events"
      className="pub-section"
      labelledBy="events-title"
      glow={{ x: '50%', y: '72%' }}
    >
      <div className="pub-container">
        <div className="cine-stack">
          <div className="cine-stack-head">
            <div>
              <p className="pub-eyebrow">Event workspace</p>
              <CinematicHeadline id="events-title" className="pub-h2">
                Every event keeps its own people.
              </CinematicHeadline>
              <p className="pub-lead">
                Open an event and see who you met there, what you talked about, what you promised
                and whether it reached your CRM. The forty people from one fair do not dissolve into
                a list with everyone you met at the next.
              </p>
            </div>

            <ul className="pub-notes cine-rise">
              <li>Filter an event by what is already in your CRM and what still is not.</li>
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
                    {MEETINGS.map(({ initials, name, discussed, promised, inCrm }) => (
                      <li key={name} className="pub-event-meeting">
                        <span className="pub-scan-avatar" aria-hidden="true">
                          {initials}
                        </span>
                        <div className="pub-event-meeting-body">
                          <p className="pub-batch-name">
                            {name}
                            <IconChevronRight size={13} stroke={2} aria-hidden="true" />
                          </p>
                          <p className="pub-batch-sub">{discussed}</p>
                          <p className="pub-event-promise">Promised: {promised}</p>
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
      </div>
    </Chapter>
  )
}
