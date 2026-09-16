import { IconArrowsExchange, IconSend } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

/**
 * The reciprocal half of the card, and the reason it spreads.
 *
 * A digital card that only pushes details outward leaves you holding nothing:
 * they have you, you have a memory of a conversation. The exchange form closes
 * that loop — the visitor sends their name, email, phone and company straight
 * back, and it arrives as a contact rather than as an email you have to
 * retype.
 *
 * This is on the free card and is not plan-gated, which is why it sits above
 * the Pro sections and carries no Pro label. The form shown is the real one:
 * four fields, headed "Send your details to Martin".
 */
export default function ExchangeSection() {
  return (
    <section id="exchange" className="pub-section pub-section--raised">
      <div className="pub-container">
        <div className="pub-split">
          <Reveal className="pub-split-copy">
            <p className="pub-eyebrow">Exchange</p>
            <h2 className="pub-h2">They get your card. You get their details.</h2>
            <p className="pub-lead">
              An exchange only counts if it goes both ways. Anyone who opens your ABC Card can send
              their details straight back to you — no app, no account, no sign-up on their side.
              You get a contact, not a business card in a jacket pocket.
            </p>

            <ul className="pub-list">
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconArrowsExchange size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Nothing for them to install</h3>
                  <p className="pub-body">
                    It is a web page. They scan, they see your card, they fill in four fields if they
                    want you to have theirs.
                  </p>
                </div>
              </li>
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconSend size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Included with the free card</h3>
                  <p className="pub-body">
                    Two-way exchange is part of your ABC Card, not something you have to upgrade to
                    unlock.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>

          <Reveal className="pub-split-media" delay={80}>
            <div className="pub-panel">
              <p className="pub-panel-tag">Reverse exchange · included free</p>

              <div className="pub-exchange">
                <p className="pub-exchange-title">Send your details to Martin</p>
                <div className="pub-exchange-fields" aria-hidden="true">
                  <span className="pub-exchange-field">Full name</span>
                  <span className="pub-exchange-field">Email</span>
                  <span className="pub-exchange-field">Phone</span>
                  <span className="pub-exchange-field">Company</span>
                </div>
                <span className="pub-exchange-send">
                  <IconSend size={15} stroke={1.9} aria-hidden="true" />
                  Send your details
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
