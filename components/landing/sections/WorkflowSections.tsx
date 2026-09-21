import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCheck,
  IconCloudUpload,
  IconMail,
} from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import Equation from '@/components/landing/cinema/Equation'

/**
 * Scene 4 — the follow-up, and where it ends up.
 *
 * Two chapters that read as one move: the meeting becomes a message, and the
 * relationship becomes a CRM record. They share a ground and the CRM chapter
 * opens by continuing the sentence the follow-up chapter finishes.
 *
 * Channel truth, checked against components/contacts/detail/SmartFollowUpCard:
 *
 *  - Email opens the composer with subject and body. With Gmail connected the
 *    message can be sent from the owner's own address (Pro; gmail.send only).
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

const CHANNELS = [
  {
    Icon: IconMail,
    label: 'Email',
    note: 'Opens your composer — or sends from your own Gmail when you connect it.',
  },
  { Icon: IconBrandWhatsapp, label: 'WhatsApp', note: 'Opens WhatsApp with the message ready.' },
  {
    Icon: IconBrandLinkedin,
    label: 'LinkedIn',
    note: 'Copies the message and opens their profile, because LinkedIn accepts no pre-filled text.',
  },
]

export function FollowUpSection() {
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
              {CHANNELS.map(({ Icon, label, note }) => (
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
              You review and edit every draft. Nothing goes out until you send it.
            </p>
          </div>

          <div className="pub-split-media cine-media">
            <div className="pub-panel">
              <p className="pub-panel-tag">Smart Follow-up</p>

              <div className="pub-draft">
                <div className="pub-draft-channels" role="list" aria-label="Choose how you want to continue">
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
                    Send from Gmail
                  </span>
                  <span className="pub-draft-note">Only when you press Send</span>
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

const PUSH_STEPS = ['Contact', 'Company', 'Association', 'Meeting', 'Follow-up task']
const DESTINATIONS = ['HubSpot', 'Salesforce', 'Pipedrive']

export function CrmSection() {
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
            <p className="pub-eyebrow">CRM sync · ABC Pro</p>
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
            </ul>

            <p className="cine-values cine-rise">
              <span>Less manual entry.</span>
              <span>Better context.</span>
              <span>A clearer next step.</span>
            </p>
          </div>

          <div className="pub-split-media cine-media cine-stage">
            <div className="pub-panel">
              <p className="pub-panel-tag">ABC record → your CRM</p>

              <div className="pub-crm">
                <div className="cine-crm-source">
                  <p className="pub-h3">John Smith · Acme GmbH</p>
                  <p className="pub-body">
                    Ambiente 2026 · DACH distribution · proposal due next week
                  </p>
                </div>

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

                <ul className="pub-chips pub-crm-dest">
                  {DESTINATIONS.map((name, i) => (
                    <li key={name} className={`pub-chip pub-chip-sm${i === 0 ? ' is-active' : ''}`}>
                      {name}
                    </li>
                  ))}
                </ul>

                <p className="pub-crm-note">Pushed to HubSpot · 5 records</p>
              </div>
            </div>
          </div>
        </div>

        <Equation
          terms={['Person', 'Meeting context', 'What matters next']}
          result={DESTINATIONS}
        />

        <p className="cine-statement cine-rise">
          ABC doesn’t replace your CRM. It turns real conversations into CRM-ready context in
          seconds.
        </p>
      </div>
    </Chapter>
  )
}
