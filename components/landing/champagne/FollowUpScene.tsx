import { Anchor, Reveal } from '@/components/landing/champagne/Parts'

/**
 * Scene 4 — the follow-up, and the CRM, as one move.
 *
 * The old page gave these a chapter each and said the same thing twice. They
 * are one idea: what you discussed becomes the message, and the message becomes
 * CRM-ready context.
 *
 * The channel lines are written against `lib/outreach-composers.ts` and say
 * exactly what it does — a mail composer, a prepared WhatsApp message, and for
 * LinkedIn the profile plus the text on the clipboard. ABC does not send on
 * LinkedIn, so the page does not say it does.
 */

const CHANNELS = [
  { name: 'Email', note: 'opens your mail app with the draft ready.' },
  { name: 'WhatsApp', note: 'opens the chat with the message prepared.' },
  { name: 'LinkedIn', note: 'opens their profile and copies the message.' },
]

const CRM = ['HubSpot', 'Pipedrive', 'Salesforce', 'CSV']

export default function FollowUpScene() {
  return (
    <section
      className="lp-section lp-section--warm"
      id="follow-up"
      aria-labelledby="follow-up-title"
    >
      <Anchor id="crm" />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Smart follow-up</p>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="lp-h2" id="follow-up-title">
            The meeting ends.
            <br />
            <span className="lp-shine">The relationship shouldn’t.</span>
          </h2>
          <div className="lp-rule" aria-hidden="true" />
        </Reveal>

        <div className="lp-followup">
          <Reveal delay={100}>
            <p className="lp-lead" style={{ marginTop: 0 }}>
              Most follow-ups are forgettable because they could have been sent to anyone. ABC writes
              from your own meeting notes, so the message continues the actual conversation — while it
              is still fresh, and in your words.
            </p>

            <div className="lp-channels">
              {CHANNELS.map((channel) => (
                <p className="lp-channel" key={channel.name}>
                  <strong>{channel.name}</strong>
                  <span>{channel.note}</span>
                </p>
              ))}
            </div>

            <div className="lp-crm">
              <p className="lp-h3">ABC doesn’t replace your CRM.</p>
              <p className="lp-note" style={{ marginTop: 4 }}>
                It turns real conversations into CRM-ready context.
              </p>
              <div className="lp-crm-row">
                {CRM.map((name) => (
                  <span className="lp-crm-chip" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="lp-tabs" role="list" aria-label="Follow-up channels">
              <span className="lp-tab is-on" role="listitem">
                Email
              </span>
              <span className="lp-tab" role="listitem">
                WhatsApp
              </span>
              <span className="lp-tab" role="listitem">
                LinkedIn
              </span>
            </div>

            <div className="lp-draft">
              <p className="lp-draft-meta">To Lena Moreau · subject: 48-hour lead times</p>
              <p className="lp-draft-body">
                {`Hi Lena,

Good to meet you at Hall 6 on Tuesday. You mentioned replacing two suppliers before Q1 and needing 48-hour lead times — here is how we hold that window, with the breakdown I promised.

Worth a short call next week?`}
              </p>
              <p className="lp-draft-from">
                Written from your meeting notes. You edit it, you send it.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
