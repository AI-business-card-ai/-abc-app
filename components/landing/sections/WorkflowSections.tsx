import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCheck,
  IconCloudUpload,
  IconFileSpreadsheet,
  IconMail,
} from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import Equation from '@/components/landing/cinema/Equation'
import { CRM_PROVIDERS } from '@/lib/crm/providers'

/**
 * Scene 4 — the follow-up, and where it ends up.
 *
 * Two chapters that read as one move: the meeting becomes a message, and the
 * relationship becomes a CRM record. They share a ground and the CRM chapter
 * opens by continuing the sentence the follow-up chapter finishes.
 *
 * Channel truth, checked against components/contacts/detail/SmartFollowUpCard:
 *
 *  - Email opens the composer with subject and body. Sending from the owner's
 *    own Gmail takes three things: ABC Pro, a Gmail connection the owner makes
 *    (gmail.send only), and Google's client configuration on this deployment.
 *    The page offers it only when the configuration exists, and always as
 *    something to connect, never as something that already works.
 *  - WhatsApp opens WhatsApp with the text ready.
 *  - LinkedIn accepts no pre-filled text, so ABC copies the message and opens
 *    the profile. The page says exactly that rather than implying three equal
 *    send integrations.
 *
 * Nothing is ever sent without the owner pressing send, and ABC does not read
 * a mailbox or Google Contacts.
 *
 * MEDIA SLOT — `follow-up-crm`. The real draft and export UI carry it for now.
 */

/* -------------------------------------------------------------- follow up */

function channels(gmail: boolean) {
  return [
    {
      Icon: IconMail,
      label: 'Email',
      note: gmail
        ? 'Opens your email app with the draft ready — or sends it from your own Gmail once you connect it.'
        : 'Opens your email app with the draft ready.',
    },
    { Icon: IconBrandWhatsapp, label: 'WhatsApp', note: 'Opens WhatsApp with the message ready.' },
    {
      Icon: IconBrandLinkedin,
      label: 'LinkedIn',
      note: 'Copies the message and opens their profile, because LinkedIn accepts no pre-filled text.',
    },
  ]
}

export function FollowUpSection({ gmail }: { gmail: boolean }) {
  const list = channels(gmail)

  return (
    <Chapter
      id="follow-up"
      className="pub-section pub-section--raised"
      labelledBy="follow-up-title"
      glow={{ x: '30%', y: '46%' }}
    >
      <div className="pub-container">
        <div className="pub-split pub-split--flip">
          <div className="pub-split-copy">
            <p className="pub-eyebrow">Smart Follow-up · ABC Pro</p>
            <CinematicHeadline id="follow-up-title" className="pub-h2">
              The meeting ends. The relationship shouldn’t.
            </CinematicHeadline>
            <p className="pub-lead">
              You already captured who you met, what you discussed and what should happen next. ABC
              turns that context into a follow-up that continues the actual conversation — while it
              is still fresh.
            </p>

            <p className="cine-callout cine-rise">Not another generic “nice to meet you.”</p>

            <ul className="pub-list cine-rise">
              {list.map(({ Icon, label, note }) => (
                <li className="pub-list-item" key={label}>
                  <span className="pub-list-icon" aria-hidden="true">
                    <Icon size={16} stroke={1.7} />
                  </span>
                  <div>
                    <h3 className="pub-h3">{label}</h3>
                    <p className="pub-body">{note}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="pub-body cine-rise">
              You review and edit every draft. Nothing goes out until you send it. Smart Follow-up
              is part of ABC Pro, and Pro pricing is coming soon.
            </p>
          </div>

          <div className="pub-split-media cine-media">
            <div className="pub-panel">
              <p className="pub-panel-tag">Smart Follow-up</p>

              <div className="pub-draft">
                <div className="pub-draft-channels" role="list" aria-label="Choose how you want to continue">
                  {list.map(({ Icon, label }, i) => (
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
                  <p className="pub-draft-subject">DACH distribution — following up from Ambiente</p>
                  <p className="pub-draft-text">
                    Hi John,
                    <br />
                    <br />
                    Good to meet you in Hall 4 on Tuesday. You mentioned you are looking for a DACH
                    distribution partner for the 2027 range — I have put together a proposal for
                    exactly that.
                    <br />
                    <br />
                    Shall I send it over this week?
                  </p>
                </div>

                <div className="pub-draft-foot">
                  <span className="pub-draft-open">
                    <IconMail size={14} stroke={1.9} aria-hidden="true" />
                    {gmail ? 'Send from Gmail' : 'Open in email'}
                  </span>
                  <span className="pub-draft-note">
                    {gmail ? 'Once Gmail is connected · only when you press Send' : 'You send it from your email app'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="cine-statement cine-rise">
          One meeting. The right context. Your preferred channel — without starting from zero.
        </p>
      </div>
    </Chapter>
  )
}

/* -------------------------------------------------------------------- CRM */

/*
  What a push sends, in ABC's words rather than one CRM's: HubSpot, Pipedrive
  and Salesforce each name these objects differently, and their own labels
  belong to the push card (components/contacts/detail/CrmPushCard).
*/
const PUSH_STEPS = ['Contact', 'Company', 'Link between them', 'Meeting', 'Follow-up']
/** What the CSV export carries (app/api/export/csv). */
const CSV_FIELDS = ['Contact', 'Company', 'Meeting', 'What you discussed', 'Next step and date']

/** "A", "A and B", "A, B and C". */
function names(list: string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * The three states, said once: direct connection, CSV export, not available
 * yet. `crm` holds only what this deployment can connect (lib/landing/
 * integrations); every other provider ABC has is named as not available yet.
 */
function availability(crm: string[]): string {
  const unavailable = CRM_PROVIDERS.map(({ name }) => name).filter((name) => !crm.includes(name))
  if (crm.length === 0) {
    return `CSV export, on every account, ready for any CRM. Direct connections to ${names(unavailable)} are not available yet.`
  }
  const rest = unavailable.length ? ` ${names(unavailable)}: not available yet.` : ''
  return `Direct sync to ${names(crm)} with ABC Pro, and Pro pricing is coming soon. CSV export on every account, for any CRM.${rest}`
}

export function CrmSection({ crm }: { crm: string[] }) {
  const direct = crm.length > 0

  return (
    <Chapter
      id="crm"
      className="pub-section pub-section--raised cine-section--continued"
      labelledBy="crm-title"
      glow={{ x: '72%', y: '52%' }}
    >
      <div className="pub-container">
        <div className="pub-split cine-bleed">
          <div className="pub-split-copy">
            <p className="pub-eyebrow">{direct ? 'CRM sync · ABC Pro' : 'CRM export'}</p>
            <CinematicHeadline id="crm-title" className="pub-h2">
              Your CRM should start with the conversation.
            </CinematicHeadline>
            <p className="pub-lead">
              ABC doesn’t send just another contact into your CRM. It keeps the person connected to
              the context behind the meeting — so your sales pipeline starts with more than a name
              and an email address.
            </p>

            <ul className="pub-list cine-rise">
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
              <li className="pub-list-item">
                <span className="pub-list-icon" aria-hidden="true">
                  <IconFileSpreadsheet size={16} stroke={1.7} />
                </span>
                <div>
                  <h3 className="pub-h3">Where it can go today</h3>
                  <p className="pub-body">{availability(crm)}</p>
                </div>
              </li>
            </ul>

            <p className="cine-values cine-rise">
              <span>Less manual entry.</span>
              <span>Better context.</span>
              <span>A clearer next step.</span>
            </p>
          </div>

          <div className="pub-split-media cine-media cine-stage">
            <div className="pub-panel">
              <p className="pub-panel-tag">{direct ? 'ABC record → your CRM' : 'ABC record → CSV'}</p>

              <div className="pub-crm">
                <div className="cine-crm-source">
                  <p className="pub-h3">John Smith · Acme GmbH</p>
                  <p className="pub-body">
                    Ambiente 2026 · DACH distribution · proposal due next week
                  </p>
                </div>

                <ul className="pub-crm-steps">
                  {(direct ? PUSH_STEPS : CSV_FIELDS).map((step) => (
                    <li key={step}>
                      <span className="pub-crm-tick" aria-hidden="true">
                        <IconCheck size={11} stroke={3} />
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>

                <ul className="pub-chips pub-crm-dest">
                  {[...crm, 'CSV'].map((name, i) => (
                    <li key={name} className={`pub-chip pub-chip-sm${i === 0 ? ' is-active' : ''}`}>
                      {name}
                    </li>
                  ))}
                </ul>

                <p className="pub-crm-note">
                  {direct ? `Pushed to ${crm[0]} · 5 records` : 'Downloaded as CSV · opens in any CRM'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Equation
          terms={['Person', 'Meeting context', 'What matters next']}
          result={direct ? crm : ['CSV export']}
        />

        <p className="cine-statement cine-rise">
          ABC doesn’t replace your CRM. It turns real conversations into CRM-ready context in
          seconds.
        </p>
      </div>
    </Chapter>
  )
}
