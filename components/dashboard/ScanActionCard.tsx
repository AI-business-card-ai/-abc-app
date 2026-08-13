'use client'

import Link from 'next/link'
import { IconCamera, IconChevronRight, IconScan } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'

/**
 * The dominant module of the dashboard: gold halo, two breathing rings,
 * scan target, and the single strongest call to action on the screen.
 */
export default function ScanActionCard() {
  return (
    <section
      className="abc-surface abc-surface-interactive relative h-full overflow-hidden"
      style={{ borderColor: 'var(--abc-gold-border)' }}
    >
      <Link
        href="/scan"
        aria-label="Open the scanner"
        className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconChevronRight size={20} stroke={1.75} />
      </Link>

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:items-center lg:gap-6 lg:p-7 lg:text-center">
        <div className="flex items-center gap-5 lg:flex-col lg:gap-6">
          <ScanRing />

          <div className="min-w-0 lg:max-w-[15rem]">
            <h2 className="text-[22px] font-bold leading-none tracking-tight text-abc-text lg:text-[26px]">
              SCAN
            </h2>
            <p className="mt-2.5 text-[14px] leading-[1.5] text-abc-secondary">
              Scan a business card, badge, QR, flyer or screen.
            </p>
          </div>
        </div>

        <Button href="/scan" size="lg" fullWidth className="lg:max-w-[15rem]">
          <IconCamera size={19} stroke={1.9} />
          Start scanning
        </Button>
      </div>
    </section>
  )
}

function ScanRing() {
  return (
    <span className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center lg:h-[132px] lg:w-[132px]">
      <span className="abc-scan-glow inset-[-18%]" aria-hidden="true" />
      <span
        className="abc-ring-pulse absolute inset-0 rounded-full border"
        style={{ borderColor: 'rgba(217, 164, 65, 0.28)' }}
        aria-hidden="true"
      />
      <span
        className="abc-ring-pulse-delayed absolute inset-[11%] rounded-full border-2"
        style={{ borderColor: 'var(--abc-gold)' }}
        aria-hidden="true"
      />
      <span
        className="absolute inset-[22%] flex items-center justify-center rounded-full"
        style={{ background: '#0d0d0f' }}
      >
        <IconScan size={34} stroke={1.5} className="text-abc-text lg:hidden" />
        <IconScan size={44} stroke={1.5} className="hidden text-abc-text lg:block" />
      </span>
    </span>
  )
}
