'use client'

import Link from 'next/link'
import { IconCamera, IconChevronRight, IconScan } from '@tabler/icons-react'
import GoldTrace from '@/components/dashboard/GoldTrace'

/**
 * SCAN, as in the approved dashboard reference: a scanner set in gold rings,
 * threads of gold running behind it, and the strongest call to action on Home.
 *
 * The dark disc lives only inside the scanner — it is the lens, not a panel.
 * Everything else here is ivory. Both links go to /scan; nothing about
 * scanning itself is decided on this card.
 */
export default function ScanActionCard() {
  return (
    <section className="abc-dash-card flex h-full flex-col" aria-labelledby="home-scan-title">
      <GoldTrace phase={0.08} />
      <div className="abc-dash-clip">
        <ScanThreads />
      </div>

      <div className="relative flex h-full flex-col p-5 sm:p-6">
        <header className="flex items-start justify-between">
          <IconScan size={32} stroke={1.5} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
          <Link href="/scan" aria-label="Open the scanner" className="abc-dash-chevron abc-focus-ring">
            <IconChevronRight size={22} stroke={1.75} />
          </Link>
        </header>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-4 sm:mt-2 sm:flex-col sm:gap-0 sm:text-center">
            <ScanMotif />
            <div className="min-w-0 sm:mt-6">
              <h2
                id="home-scan-title"
                className="text-[24px] font-bold leading-none tracking-tight text-[#161412] sm:text-[27px]"
              >
                SCAN
              </h2>
              <p className="mt-2.5 max-w-[16rem] text-[14.5px] leading-[1.5] text-[#5d574f] sm:mx-auto sm:text-[15px]">
                Scan a business card, badge, QR, flyer or screen.
              </p>
            </div>
          </div>

          <Link
            href="/scan"
            className="abc-gold-cta abc-focus-ring mt-5 inline-flex h-[54px] w-full items-center justify-center gap-2 self-center whitespace-nowrap rounded-[13px] px-4 text-[15.5px] font-semibold sm:mt-8 sm:h-[58px] sm:max-w-[16.25rem] min-[1536px]:gap-2.5 min-[1536px]:px-5 min-[1536px]:text-[16px]"
          >
            <IconCamera size={21} stroke={1.8} />
            Start scanning
            <IconChevronRight size={18} stroke={2} />
          </Link>
        </div>
      </div>
    </section>
  )
}

/** Concentric gold rings around a dark lens with the scan glyph. */
function ScanMotif() {
  return (
    <svg
      viewBox="0 0 220 220"
      className="h-[112px] w-[112px] shrink-0 sm:h-[184px] sm:w-[184px] min-[1360px]:h-[196px] min-[1360px]:w-[196px]"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="abc-scan-halo" cx="110" cy="110" r="110" gradientUnits="userSpaceOnUse">
          <stop offset="0.45" stopColor="#e2b64e" stopOpacity="0.34" />
          <stop offset="0.8" stopColor="#e2b64e" stopOpacity="0.08" />
          <stop offset="1" stopColor="#e2b64e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="abc-scan-lens" cx="92" cy="84" r="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a3226" />
          <stop offset="0.55" stopColor="#17140f" />
          <stop offset="1" stopColor="#0b0a08" />
        </radialGradient>
        <linearGradient id="abc-scan-ring" x1="30" y1="20" x2="190" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2d58c" />
          <stop offset="0.4" stopColor="#c99628" />
          <stop offset="0.75" stopColor="#a97d1c" />
          <stop offset="1" stopColor="#e9c46a" />
        </linearGradient>
        <filter id="abc-scan-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      <circle cx="110" cy="110" r="110" fill="url(#abc-scan-halo)" />
      <circle cx="110" cy="110" r="101" fill="none" stroke="#c99628" strokeOpacity="0.24" strokeWidth="1" />
      <circle cx="110" cy="110" r="90" fill="none" stroke="#e2b64e" strokeOpacity="0.55" strokeWidth="5" filter="url(#abc-scan-soft)" />
      <circle cx="110" cy="110" r="90" fill="none" stroke="url(#abc-scan-ring)" strokeWidth="2.2" />
      {/* A glint that circles the ring. */}
      <g className="abc-scan-orbit">
        <circle
          cx="110"
          cy="110"
          r="90"
          fill="none"
          stroke="#fff4d2"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="42 524"
          strokeOpacity="0.95"
        />
      </g>
      <circle cx="110" cy="110" r="78" fill="none" stroke="#c99628" strokeOpacity="0.42" strokeWidth="1" />
      <circle cx="110" cy="110" r="65" fill="url(#abc-scan-lens)" stroke="#e2b64e" strokeOpacity="0.55" strokeWidth="1.2" />

      {/* The scan glyph: four corners, in gold. */}
      <g fill="none" stroke="#e2b64e" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M84 98v-6a8 8 0 0 1 8-8h6" />
        <path d="M122 84h6a8 8 0 0 1 8 8v6" />
        <path d="M136 122v6a8 8 0 0 1-8 8h-6" />
        <path d="M98 136h-6a8 8 0 0 1-8-8v-6" />
      </g>
    </svg>
  )
}

/** Fine gold threads crossing behind the scanner. */
function ScanThreads() {
  return (
    <svg
      className="absolute inset-0 hidden h-full w-full sm:block"
      viewBox="0 0 320 500"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="abc-scan-thread" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c99628" stopOpacity="0" />
          <stop offset="0.3" stopColor="#c99628" stopOpacity="0.75" />
          <stop offset="0.7" stopColor="#e2b64e" stopOpacity="0.7" />
          <stop offset="1" stopColor="#e2b64e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="url(#abc-scan-thread)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <path d="M-20 318C60 300 116 214 196 196S300 150 340 118" vectorEffect="non-scaling-stroke" />
        <path d="M-20 338C70 318 128 236 208 218S302 176 340 150" vectorEffect="non-scaling-stroke" opacity="0.75" />
        <path d="M-20 296C52 280 106 192 186 172S292 120 340 92" vectorEffect="non-scaling-stroke" opacity="0.55" />
        <path d="M-20 470C80 446 196 426 340 384" vectorEffect="non-scaling-stroke" opacity="0.45" />
        <path d="M-20 488C96 462 214 446 340 410" vectorEffect="non-scaling-stroke" opacity="0.3" />
      </g>
    </svg>
  )
}
