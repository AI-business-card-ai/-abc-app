'use client'

import { useState } from 'react'
import MultiCardClient from '@/components/scan/MultiCardClient'
import ScanClient from '@/components/scan/ScanClient'
import ScanModeSwitch, { type ScanFlow } from '@/components/scan/ScanModeSwitch'

/**
 * The scan screen's front door.
 *
 * Single-card scanning is untouched and still the default: `ScanClient` renders
 * exactly as it did, including its own header, so nothing about the flow most
 * people use changes. This adds a choice above it and a second flow beside it.
 *
 * The two are mounted exclusively rather than hidden with CSS, which matters
 * more than it looks: both drive the camera, and two components holding the
 * same video track produce a black viewfinder on a real phone.
 */
export default function ScanEntry() {
  const [flow, setFlow] = useState<ScanFlow>('single')

  if (flow === 'single') {
    return (
      <>
        {/*
          The switch takes the page's top offset, and ScanClient is told not to
          claim it a second time — otherwise the viewfinder starts a full
          header's height further down than it does today.
        */}
        {/* `pb-4` is the gap to the scanner below, not a top offset — the page's
            top spacing stays the single `abc-page-top` contract. */}
        <div className="mx-auto w-full max-w-[1000px] abc-page-top px-4 pb-4 sm:px-6 lg:px-8">
          <ScanModeSwitch flow={flow} onChange={setFlow} />
        </div>
        <ScanClient topPadding={false} />
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col abc-page-top px-4 pb-8 sm:px-6 lg:px-8">
      <header className="shrink-0">
        <h1 className="text-[24px] font-bold tracking-tight text-abc-text lg:text-[32px]">
          Multi-Card Scan
        </h1>
        <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[15px]">
          Scan up to 10 business cards at once, then add the meeting once for all of them.
        </p>
      </header>

      <div className="mt-4">
        <ScanModeSwitch flow={flow} onChange={setFlow} />
      </div>

      <MultiCardClient />
    </div>
  )
}
