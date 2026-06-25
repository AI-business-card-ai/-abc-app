'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  buildConversationStarters,
  hasDisplayValue,
  parseEnrichedContext,
  splitContentWithUrls,
  type EnrichedSection,
} from '@/lib/research'
import type { ContactEvent, NewsItem, PersonQuote, ScannedContact, SpeakingEngagement } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onStarterClick: (text: string) => void
  onResearchMore?: () => void
  researching?: boolean
}

const cleanText = (text: string) =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[(\d+)\]/g, '')
    .trim()

function EventBadge({ type }: { type: 'past' | 'upcoming' | 'speaking' }) {
  if (type === 'upcoming') {
    return (
      <span
        className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
        style={{ background: 'rgba(0,212,212,0.15)', color: '#00d4d4', border: '1px solid rgba(0,212,212,0.35)' }}
      >
        Upcoming 🔔
      </span>
    )
  }
  if (type === 'speaking') {
    return (
      <span
        className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
        style={{ background: 'rgba(240,25,125,0.12)', color: '#f0197d', border: '1px solid rgba(240,25,125,0.35)' }}
      >
        Speaker 🎤
      </span>
    )
  }
  return (
    <span
      className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
      style={{ background: 'rgba(74,81,104,0.25)', color: '#8892b0', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      Past
    </span>
  )
}

function EventRow({
  event,
  type,
}: {
  event: ContactEvent | SpeakingEngagement
  type: 'past' | 'upcoming' | 'speaking'
}) {
  const name = 'name' in event ? event.name : event.event
  const location = 'location' in event ? event.location : undefined
  const date = event.date
  const role = 'role' in event ? event.role : ('title' in event ? event.title : undefined)
  const description = 'description' in event ? event.description : undefined

  if (!hasDisplayValue(name)) return null

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5"
      style={{ background: '#1c1f35', border: '1px solid rgba(139,92,246,0.12)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: '#f0f0ff' }}>{name}</p>
        <EventBadge type={type} />
      </div>
      {(hasDisplayValue(location) || hasDisplayValue(date)) && (
        <p className="text-xs" style={{ color: '#8892b0' }}>
          {[location, date].filter((v) => hasDisplayValue(v)).join(' · ')}
        </p>
      )}
      {hasDisplayValue(role) && (
        <p className="text-xs" style={{ color: '#a78bfa' }}>{role}</p>
      )}
      {hasDisplayValue(description) && (
        <p className="text-xs leading-relaxed" style={{ color: '#8892b0' }}>{description}</p>
      )}
    </div>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="abc-card p-4 flex flex-col gap-3">
      <span className="abc-label flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </span>
      {children}
    </div>
  )
}

function CompanySection({ section }: { section: EnrichedSection }) {
  return (
    <SectionCard title={section.label} icon={section.icon}>
      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#8892b0' }}>
        {splitContentWithUrls(
          section.content
            .split('\n')
            .map((line) => cleanText(line))
            .join('\n')
        ).map((seg, i) =>
          seg.isUrl ? (
            <a
              key={i}
              href={seg.text.startsWith('http') ? seg.text : `https://${seg.text}`}
              target="_blank"
              rel="noreferrer"
              className="underline break-all"
              style={{ color: '#00d4d4' }}
            >
              {seg.text}
            </a>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
    </SectionCard>
  )
}

export default function IntelligencePanel({
  contact,
  onStarterClick,
  onResearchMore,
  researching,
}: Props) {
  const pastEvents = (contact.events_past || []).filter((e) => hasDisplayValue(e.name))
  const upcomingEvents = (contact.events_upcoming || []).filter((e) => hasDisplayValue(e.name))
  const speaking = (contact.speaking_engagements || []).filter((e) => hasDisplayValue(e.event))
  const news = (contact.recent_news || []).filter((n) => hasDisplayValue(n.title)).slice(0, 3)
  const quotes = (contact.person_quotes || []).filter((q) => hasDisplayValue(q.text))

  const enrichedSections = parseEnrichedContext(contact.enriched_context).filter((section) => {
    if (section.label === 'Recent News' || section.label === 'Person Profile' || section.label === 'Events') {
      return false
    }
    return true
  })

  const riskSection = enrichedSections.find((s) => s.label === 'Risk Assessment')
  const companySections = enrichedSections.filter(
    (s) => s.label !== 'Risk Assessment' && s.label !== 'Recent News' && s.label !== 'Person Profile' && s.label !== 'Events'
  )

  const hasResearch = hasDisplayValue(contact.enriched_context)
  const hasRiskData = riskSection?.isRisk === true
  const hasEvents = pastEvents.length > 0 || upcomingEvents.length > 0 || speaking.length > 0
  const starters = hasEvents ? buildConversationStarters(contact) : []

  const hasPersonBio = hasDisplayValue(contact.person_bio)
  const hasAnyIntelligence =
    hasEvents ||
    news.length > 0 ||
    hasPersonBio ||
    quotes.length > 0 ||
    hasResearch ||
    companySections.length > 0

  if (!hasAnyIntelligence) {
    if (!onResearchMore) return null
    return (
      <button
        onClick={onResearchMore}
        disabled={researching}
        className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40 abc-card"
        style={{ color: '#00d4d4' }}
      >
        {researching ? 'Researching...' : '🔍 Research more info'}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="abc-label">Intelligence</span>

      {hasEvents && (
        <SectionCard title="Events & Speaking" icon="📅">
          <div className="flex flex-col gap-2">
            {upcomingEvents.map((event, idx) => (
              <EventRow key={`up-${event.name}-${idx}`} event={event} type="upcoming" />
            ))}
            {speaking.map((event, idx) => (
              <EventRow key={`sp-${event.event}-${idx}`} event={event} type="speaking" />
            ))}
            {pastEvents.map((event, idx) => (
              <EventRow key={`pa-${event.name}-${idx}`} event={event} type="past" />
            ))}
          </div>

          {starters.length > 0 && (
            <div className="mt-1 pt-3 border-t" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
              <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: '#4a5168' }}>
                💡 Conversation starters
              </p>
              <div className="flex flex-col gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => onStarterClick(starter)}
                    className="text-left text-sm rounded-lg px-3 py-2 transition-colors"
                    style={{
                      background: 'rgba(0,212,212,0.08)',
                      border: '1px solid rgba(0,212,212,0.25)',
                      color: '#f0f0ff',
                    }}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {news.length > 0 && (
        <SectionCard title="Recent News" icon="📰">
          <div className="flex flex-col gap-2">
            {news.map((item: NewsItem, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="rounded-lg px-3 py-2.5"
                style={{ background: '#1c1f35', border: '1px solid rgba(139,92,246,0.12)' }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {hasDisplayValue(item.date) && (
                    <span className="text-[10px]" style={{ color: '#4a5168' }}>{item.date}</span>
                  )}
                  {hasDisplayValue(item.source) && (
                    <span
                      className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}
                    >
                      {item.source}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold" style={{ color: '#f0f0ff' }}>{item.title}</p>
                {hasDisplayValue(item.summary) && (
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8892b0' }}>{item.summary}</p>
                )}
                {hasDisplayValue(item.url) && (
                  <a
                    href={item.url!.startsWith('http') ? item.url! : `https://${item.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs mt-1 inline-block underline"
                    style={{ color: '#00d4d4' }}
                  >
                    Read more
                  </a>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {hasPersonBio && (
        <SectionCard title="Person Profile" icon="👤">
          <p className="text-sm leading-relaxed" style={{ color: '#8892b0' }}>{contact.person_bio}</p>
          {quotes.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              {quotes.map((quote: PersonQuote, idx) => (
                <blockquote
                  key={`${quote.text}-${idx}`}
                  className="rounded-lg px-3 py-2 border-l-2"
                  style={{ background: '#1c1f35', borderColor: '#8b5cf6', color: '#8892b0' }}
                >
                  <p className="text-sm italic">&ldquo;{quote.text}&rdquo;</p>
                  {(hasDisplayValue(quote.source) || hasDisplayValue(quote.date)) && (
                    <footer className="text-[10px] mt-1" style={{ color: '#4a5168' }}>
                      {[quote.source, quote.date].filter((v) => hasDisplayValue(v)).join(' · ')}
                    </footer>
                  )}
                </blockquote>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {hasResearch && (
        <SectionCard title="Risk Assessment" icon="⚠️">
          {hasRiskData && riskSection ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#fca5a5' }}>
              {riskSection.content}
            </p>
          ) : riskSection && !hasRiskData ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#8892b0' }}>
              {riskSection.content}
            </p>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg w-fit"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)' }}
            >
              ✓ No issues found
            </span>
          )}
        </SectionCard>
      )}

      {companySections.map((section) => (
        <CompanySection key={section.title} section={section} />
      ))}

      {onResearchMore && (
        <button
          onClick={onResearchMore}
          disabled={researching}
          className="w-full rounded-xl py-2.5 text-xs font-medium disabled:opacity-40"
          style={{ color: '#8892b0', border: '1px solid rgba(139,92,246,0.12)' }}
        >
          {researching ? 'Refreshing research…' : '↻ Refresh intelligence'}
        </button>
      )}
    </div>
  )
}
