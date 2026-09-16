import {
  IconArrowsExchange,
  IconCloudUpload,
  IconMail,
  IconMessage,
  IconScan,
} from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

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

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="pub-section pub-section--raised" aria-labelledby="how-title">
      <div className="pub-container">
        <Reveal>
          <div className="pub-head-center">
            <p className="pub-eyebrow">How ABC works</p>
            <h2 className="pub-h2" id="how-title">
              A saved contact isn&apos;t a relationship.
            </h2>
            <p className="pub-lead">
              A card, a QR code or a LinkedIn connection keeps a name. It loses where you met, what
              you talked about, why the person matters and what you said you would do next. ABC
              keeps all of it.
            </p>
          </div>
        </Reveal>

        <ol className="pub-steps">
          {STEPS.map(({ Icon, name, body }, i) => (
            <Reveal as="li" key={name} className="pub-step" delay={i * 60}>
              <span className="pub-step-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="pub-step-icon" aria-hidden="true">
                <Icon size={18} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{name}</h3>
              <p className="pub-body">{body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
