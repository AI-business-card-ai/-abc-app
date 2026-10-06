'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconBell, IconChevronDown, IconSearch } from '@tabler/icons-react'
import EventsCard from '@/components/dashboard/EventsCard'
import ContactsCard from '@/components/dashboard/ContactsCard'
import FollowUpsCard from '@/components/dashboard/FollowUpsCard'
import MyCardCard from '@/components/dashboard/MyCardCard'
import ScanActionCard from '@/components/dashboard/ScanActionCard'
import ExpoMissionPreview from '@/components/expo-mission/ExpoMissionPreview'
import Avatar from '@/components/ui/abc/Avatar'
import { useAppProfile } from '@/lib/hooks/useAppProfile'
import { useFollowUpBadge } from '@/lib/hooks/useFollowUpBadge'
import type { DashboardData } from '@/lib/dashboard-data'

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Monday, 6 Oct 2026" — the date line in the approved reference. */
function dateLine(now: Date): string {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

/**
 * Home, built to the approved dashboard reference.
 *
 *   [ SCAN ] [ CONTACTS ] [ MY ABC ] [ FOLLOW-UPS ]
 *   [ EVENT & EXPO INTELLIGENCE ————————————————— ]
 *
 * Four columns from 1360px, in the reference's proportions; two columns on
 * tablets and small laptops; one on phones. Below four columns My ABC moves
 * to the front, because on a phone the card and its QR are the first thing
 * someone needs — the order is visual only, the reading order stays Scan,
 * Contacts, My ABC, Follow-ups.
 *
 * Recent Activity is not on Home: every line in it was reachable from the card
 * it belonged to, so it was a second copy of the dashboard underneath the
 * dashboard. Events are not a fifth card either — they are what Event & Expo
 * Intelligence does today, so they live in that panel, with Expo Mission
 * inside it as the feature that is coming.
 */
export default function Dashboard({ data }: { data: DashboardData }) {
  const { profile } = useAppProfile()
  const dueCount = useFollowUpBadge()

  /*
    Rendered once on the server, then corrected to the visitor's own clock.
    The server's hour is UTC; the greeting and the date line are the owner's.
  */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => setNow(new Date()), [])

  return (
    <div className="abc-home mx-auto w-full max-w-[1520px] abc-page-top px-4 pb-10 sm:px-6 lg:!pt-5 lg:pb-4 lg:pl-5 lg:pr-6">
      <div className="abc-home-light" aria-hidden="true" />
      <HeaderThreads />

      {/* Desktop-only bar — mobile uses the global app header. */}
      <div className="hidden items-center justify-between gap-6 lg:flex">
        <HomeSearch />

        <div className="flex items-center gap-3">
          <Link
            href="/follow-ups"
            className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[rgba(201,150,40,0.1)] abc-focus-ring"
            aria-label={dueCount > 0 ? `Follow-ups — ${dueCount} need attention` : 'Follow-ups'}
          >
            <IconBell size={24} stroke={1.6} className="text-[#2b2722]" />
            {dueCount > 0 ? (
              <span
                className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#1a1205]"
                style={{ background: 'linear-gradient(180deg, #edcb78, #c99628)', boxShadow: '0 0 0 2px #fbf7ef' }}
              >
                {dueCount > 9 ? '9+' : dueCount}
              </span>
            ) : null}
          </Link>

          <span className="h-8 w-px" style={{ background: 'rgba(201, 150, 40, 0.22)' }} aria-hidden="true" />

          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-full p-0.5 abc-focus-ring"
            aria-label="Your profile"
          >
            <Avatar src={profile?.avatarUrl} name={profile?.fullName} size={46} ring />
            <IconChevronDown size={18} stroke={1.75} className="text-[#3a352d]" />
          </Link>
        </div>
      </div>

      <div className="flex items-end justify-between gap-6 lg:mt-8">
        <header className="min-w-0">
          <h1
            className="text-[30px] font-bold leading-[1.06] tracking-[-0.025em] text-[#141210] sm:text-[38px] lg:text-[44px] min-[1360px]:text-[52px]"
            suppressHydrationWarning
          >
            {greeting(now)}, <span className="abc-gold-name">{data.firstName}.</span>
          </h1>
          <p className="mt-2 text-[15.5px] text-[#6a645b] sm:text-[18px] min-[1360px]:text-[21px]">
            Everything you need after the handshake.
          </p>
        </header>

        <div className="hidden shrink-0 pb-1 text-right xl:block">
          <p className="text-[15px] font-medium text-[#3a352d]" suppressHydrationWarning>
            {dateLine(now)}
          </p>
          <p className="mt-1 text-[14px] text-[#6a645b]">Turning connections into opportunities.</p>
          <span
            className="ml-auto mt-3 block h-px w-24"
            style={{ background: 'linear-gradient(90deg, transparent, #c99628)' }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:mt-7 min-[1360px]:grid-cols-[minmax(0,1.19fr)_minmax(0,1.2fr)_minmax(0,1.56fr)_minmax(0,1fr)] min-[1360px]:gap-[18px]">
        <div className="min-w-0">
          <ScanActionCard />
        </div>

        <div className="min-w-0">
          <ContactsCard contacts={data.contacts} total={data.contactsTotal} />
        </div>

        <div className="order-first min-w-0 min-[1360px]:order-none">
          <MyCardCard card={data.card} />
        </div>

        <div className="min-w-0">
          <FollowUpsCard counts={data.followUps} />
        </div>
      </div>

      {/*
        Event & Expo Intelligence. It sits under the working dashboard rather
        than above it: what ABC does today comes first, and a feature nobody
        can use yet does not get the top of the screen.
      */}
      <div className="mt-4 sm:mt-5 min-[1360px]:mt-[18px]">
        <EventsCard
          events={data.events}
          eventsTotal={data.eventsTotal}
          opportunities={data.opportunities}
          contactsTotal={data.contactsTotal}
        >
          <ExpoMissionPreview />
        </EventsCard>
      </div>
    </div>
  )
}

/**
 * The search field from the reference, wired to the one search ABC has:
 * Contacts, which matches on name, company, role, email, event and notes.
 * The placeholder says what it searches, so it never promises more than that.
 */
function HomeSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    router.push(q ? `/contacts?q=${encodeURIComponent(q)}` : '/contacts')
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="abc-dash-search flex h-12 w-full max-w-[608px] items-center gap-3 rounded-[14px] px-4 backdrop-blur-md"
    >
      <IconSearch size={21} stroke={1.75} className="shrink-0 text-[#3a352d]" aria-hidden="true" />
      <input
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts, companies or events..."
        aria-label="Search contacts by name, company or event"
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 text-[15px] text-abc-text"
      />
    </form>
  )
}

/** Fine gold threads sweeping across the top of Home, behind the header. */
function HeaderThreads() {
  return (
    <svg className="abc-home-lines" viewBox="0 0 1100 300" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="abc-home-thread" x1="0" y1="0" x2="1100" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c99628" stopOpacity="0" />
          <stop offset="0.35" stopColor="#c99628" stopOpacity="0.55" />
          <stop offset="0.75" stopColor="#e2b64e" stopOpacity="0.78" />
          <stop offset="1" stopColor="#e2b64e" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g stroke="url(#abc-home-thread)" strokeWidth="1">
        <path d="M0 22C300 12 520 122 760 112S1000 42 1120 72" vectorEffect="non-scaling-stroke" />
        <path d="M80 2C360 32 560 152 800 142S1020 82 1120 112" vectorEffect="non-scaling-stroke" opacity="0.8" />
        <path d="M200 -8C420 42 620 182 860 172S1040 122 1120 152" vectorEffect="non-scaling-stroke" opacity="0.65" />
        <path d="M420 2C600 62 760 212 960 202S1080 172 1120 192" vectorEffect="non-scaling-stroke" opacity="0.5" />
        <path d="M0 72C260 62 480 162 720 162S980 102 1120 132" vectorEffect="non-scaling-stroke" opacity="0.4" />
        <path d="M560 -6C700 30 860 120 1000 108S1090 70 1120 52" vectorEffect="non-scaling-stroke" opacity="0.55" />
      </g>
    </svg>
  )
}
