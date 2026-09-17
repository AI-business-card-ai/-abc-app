import {
  IconArrowsExchange,
  IconCloudUpload,
  IconMail,
  IconMessage,
  IconScan,
} from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import PanelGroup, { type Panel } from '@/components/landing/cinema/PanelGroup'

/**
 * The problem, and the five steps ABC takes against it.
 *
 * Also the target of the hero's "See how it works" button. That link pointed at
 * an id nothing on the page carried any more — the old workflow strip was
 * removed in the redesign and the anchor went with it — so the secondary CTA
 * silently did nothing. It lands here now, directly after the turn from the
 * free card into the work, which is where the answer to "how" belongs.
 *
 * Placed after the opening chapters rather than straight under the hero so the
 * approved opening sequence — hero, card, turn — stays intact, and so the
 * steps arrive at the moment the page promises "what happens next".
 *
 * The steps are expanding panels rather than five equal tiles: one stage of the
 * lifecycle leads at a time, and every other stage stays fully readable beside
 * it. Each stage then gets its own chapter further down.
 */

const STEPS = [
  {
    Icon: IconArrowsExchange,
    name: 'Meet',
    body: 'Share your ABC Card, or take theirs.',
  },
  {
    Icon: IconScan,
    name: 'Scan',
    body: 'One card or several at once becomes a contact and a meeting.',
  },
  {
    Icon: IconMessage,
    name: 'Remember',
    body: 'Where you met, what you discussed and what you promised.',
  },
  {
    Icon: IconMail,
    name: 'Follow up',
    body: 'A draft written from the meeting, sent when you say so.',
  },
  {
    Icon: IconCloudUpload,
    name: 'CRM',
    body: 'The person, the company and the meeting, in your CRM.',
  },
]

const PANELS: Panel[] = STEPS.map(({ Icon, name, body }, i) => ({
  key: name,
  title: name,
  lead: (
    <>
      <span className="cine-step-num">{String(i + 1).padStart(2, '0')}</span>
      <span className="cine-step-icon">
        <Icon size={18} stroke={1.7} />
      </span>
    </>
  ),
  body: <p className="pub-body">{body}</p>,
}))

export default function HowItWorksSection() {
  return (
    <Chapter
      id="how-it-works"
      className="pub-section pub-section--raised"
      labelledBy="how-title"
      glow={{ x: '50%', y: '70%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">How ABC works</p>
          <CinematicHeadline id="how-title" className="pub-h2">
            {"A saved contact isn't a relationship."}
          </CinematicHeadline>
          <p className="pub-lead">
            A card, a QR code or a LinkedIn connection keeps a name. It loses where you met, what
            you talked about, why the person matters and what you said you would do next. ABC
            keeps all of it.
          </p>
        </div>

        <PanelGroup panels={PANELS} ordered className="cine-steps" label="How ABC works, in five steps" />
      </div>
    </Chapter>
  )
}
