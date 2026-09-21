import { IconArrowRight } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 5a — where the page stops explaining mechanics and starts explaining
 * value.
 *
 * The comparison is deliberately qualitative. No percentage, no "saves 4.2
 * hours per event": nobody has measured that, and an invented figure is the
 * fastest way to lose a serious buyer. What is true is the shape of the
 * change — the admin moves from hours after the event to seconds after each
 * meeting — and the price framing the owner approved.
 *
 * Written so it reads for three people at once: the salesperson doing the
 * admin, the manager who wants CRM context, and the company paying for the
 * stand.
 */

const WITHOUT = ['50 meetings', '50 business cards', 'Notes scattered everywhere', 'Manual CRM entry', 'Follow-up days late']
const WITH = ['Scan', 'Context', 'Follow-up', 'CRM']
const VALUES = [
  'Less manual entry.',
  'Faster follow-up.',
  'Better CRM data.',
  'More time for selling.',
]

export default function RoiSection() {
  return (
    <Chapter
      id="value"
      className="pub-section"
      labelledBy="value-title"
      glow={{ x: '50%', y: '46%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">What it saves</p>
          <CinematicHeadline id="value-title" className="pub-h2">
            Spend seconds after the meeting — not hours after the event.
          </CinematicHeadline>
          <p className="pub-lead">
            Your sales team already spends enough time travelling, meeting people and creating
            opportunities. ABC reduces the admin that comes afterwards.
          </p>
        </div>

        <div className="cine-compare cine-rise">
          <div className="cine-compare-col">
            <p className="cine-compare-head">Without ABC</p>
            <ul>
              {WITHOUT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="cine-compare-cost">Hours, after the event</p>
          </div>

          <span className="cine-compare-arrow" aria-hidden="true">
            <IconArrowRight size={20} stroke={1.8} />
          </span>

          <div className="cine-compare-col cine-compare-col--with">
            <p className="cine-compare-head">With ABC</p>
            <ul>
              {WITH.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="cine-compare-cost">Seconds, after each meeting</p>
          </div>
        </div>

        <ul className="cine-values cine-values--grid cine-rise">
          {VALUES.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>

        <p className="cine-statement cine-rise">Hours saved. For less than one lunch at the fair.</p>
        <p className="pub-body cine-rise cine-centered">
          One useful meeting can be worth far more than the cost of keeping it organised.
        </p>
      </div>
    </Chapter>
  )
}
