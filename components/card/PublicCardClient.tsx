'use client'

import { useState } from 'react'
import DigitalCardView from '@/components/card/DigitalCardView'
import CardExchangeModal from '@/components/card/CardExchangeModal'
import type { DigitalCardData } from '@/lib/card/types'

export default function PublicCardClient({
  card,
  wallet,
}: {
  card: DigitalCardData
  wallet: { apple: boolean; google: boolean }
}) {
  const [exchangeOpen, setExchangeOpen] = useState(false)

  function handleLinkClick(linkId: string) {
    void fetch('/api/card/link-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    }).catch((err) => console.error('[PublicCardClient] link-click failed:', err))
  }

  return (
    <>
      <DigitalCardView
        card={card}
        wallet={wallet}
        onExchange={() => setExchangeOpen(true)}
        onLinkClick={handleLinkClick}
      />
      <CardExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        ownerName={card.fullName}
        ownerUserId={card.userId}
      />
    </>
  )
}
